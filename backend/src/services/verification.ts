import type { AgentStep, InspectionCategory, JudgeOutput, MilestoneDTO, PolicyDTO, Verdict } from '@arbiter/shared';
import type { AppConfig } from '../config/env';
import type { InspectionsTable, SubmissionsTable } from '../db/types';
import type { DecisionLog } from '../agent/decisionLog';
import { detectInjection, type InjectionReport } from '../agent/injection/detector';
import { judgeDeliverable } from '../agent/judge';
import { evaluatePolicy } from '../agent/policy/engine';
import { verifyFile } from '../agent/verifiers/file';
import { verifyGithubPr } from '../agent/verifiers/github';
import type { SiteFetcher } from '../agent/verifiers/siteFetcher';
import { summarizeChecks, fail, type CheckResult, type VerifierOutput } from '../agent/verifiers/types';
import { verifyUrl } from '../agent/verifiers/url';
import type { GithubApi } from '../github/types';
import { newId } from '../lib/crypto';
import { errorMessage, notFound } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { addSecondsIso, nowIso, startOfUtcDayIso } from '../lib/time';
import type { LlmProvider } from '../llm';
import type { EventBus } from '../realtime/eventBus';
import type { Repositories } from '../repositories';
import type { MilestoneTransitions } from './transitions';

export interface VerificationDeps {
  config: AppConfig;
  repos: Repositories;
  llm: LlmProvider;
  github: GithubApi;
  fetcher: SiteFetcher;
  decisionLog: DecisionLog;
  transitions: MilestoneTransitions;
  bus: EventBus;
  log: Logger;
}

/**
 * The verification agent pipeline:
 *   deterministic checks → injection scan → LLM judgment → policy gate → final decision.
 * Deterministic failure is a hard gate; the policy engine, not the LLM, decides auto-release.
 */
export class VerificationService {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly d: VerificationDeps,
    private readonly onApproved: (milestoneId: string) => Promise<void>,
  ) {}

  /** Fire-and-forget entry point used by HTTP handlers. */
  verifyInBackground(submissionId: string): void {
    setImmediate(() => {
      this.verify(submissionId).catch((err) => this.d.log.error({ err: errorMessage(err), submissionId }, 'verification crashed'));
    });
  }

  async verify(submissionId: string): Promise<void> {
    const sub = await this.d.repos.submissions.getRow(submissionId);
    if (!sub) throw notFound('Submission');
    if (this.inFlight.has(sub.milestone_id)) return;
    this.inFlight.add(sub.milestone_id);
    try {
      await this.run(sub);
    } finally {
      this.inFlight.delete(sub.milestone_id);
    }
  }

  private step(milestoneId: string, step: AgentStep, detail: string): void {
    this.d.bus.publish({ type: 'agent.step', milestoneId, step, detail });
  }

  private async run(sub: SubmissionsTable): Promise<void> {
    const { repos, decisionLog, transitions } = this.d;
    const milestoneId = sub.milestone_id;
    await transitions.transition(milestoneId, 'VERIFYING', { reason: 'Verification started', actorRole: 'agent:verifier' });

    try {
      const milestone = await repos.milestones.getDTO(milestoneId);
      if (!milestone) throw notFound('Milestone');
      const policy = await repos.policies.getByContract(milestone.contractId);
      if (!policy) throw notFound('Policy');

      // 1. Deterministic checks (hard gate)
      this.step(milestoneId, 'deterministic_checks', `Running ${milestone.verification.type} checks`);
      const out = await this.runVerifier(milestone, sub);
      const summary = summarizeChecks(out.checks);
      await this.saveInspections(sub, 'deterministic', out.checks);
      await decisionLog.append({
        milestoneId,
        submissionId: sub.id,
        action: 'DETERMINISTIC_CHECKS',
        actor: 'agent:verifier',
        inputs: { submissionId: sub.id, url: sub.url, fileSha256: sub.file_sha256, verification: milestone.verification },
        outputs: {
          pass: summary.deterministicPass,
          errored: summary.errored,
          checks: out.checks.map((c) => ({ name: c.name, status: c.status, severity: c.severity, message: c.message })),
          facts: out.facts,
        },
      });

      // 2. Prompt-injection scan over everything the contractor controls
      const untrusted = [...out.untrusted];
      if (sub.notes) untrusted.push({ label: 'contractor_notes', content: sub.notes });
      this.step(milestoneId, 'injection_scan', `Scanning ${untrusted.length} untrusted source(s) for prompt injection`);
      const injection = await detectInjection(this.d.llm, untrusted);
      await this.saveInspections(sub, 'injection', injectionChecks(injection));
      await decisionLog.append({
        milestoneId,
        submissionId: sub.id,
        action: 'INJECTION_SCAN',
        actor: 'agent:injection-detector',
        inputs: { sources: untrusted.map((s) => ({ label: s.label, chars: s.content.length })) },
        outputs: {
          suspected: injection.suspected,
          severity: injection.severity,
          heuristicScore: injection.heuristic.score,
          matches: injection.heuristic.matches.map((m) => ({ rule: m.ruleId, source: m.source, excerpt: m.excerpt })),
          classifier: injection.classifier,
          classifierError: injection.classifierError,
        },
        model: injection.model,
        usage: injection.usage,
        latencyMs: injection.latencyMs,
      });

      // 3. LLM judgment (advisory)
      this.step(milestoneId, 'llm_judgment', `Asking ${this.d.llm.model} to judge ${milestone.acceptanceCriteria.length} criteria`);
      let judge: JudgeOutput | null = null;
      let judgeError: string | null = null;
      try {
        const res = await judgeDeliverable(this.d.llm, {
          milestone,
          checks: out.checks,
          facts: out.facts,
          untrusted,
          deterministicPass: summary.deterministicPass,
          injectionSuspected: injection.suspected,
        });
        judge = res.data;
        await decisionLog.append({
          milestoneId,
          submissionId: sub.id,
          action: 'LLM_VERDICT',
          actor: 'agent:judge',
          verdict: judge.verdict,
          confidence: judge.confidence,
          inputs: { criteria: milestone.acceptanceCriteria, checks: out.checks.map((c) => [c.name, c.status]) },
          outputs: judge,
          model: res.model,
          usage: res.usage,
          latencyMs: res.latencyMs,
        });
      } catch (e) {
        judgeError = errorMessage(e);
        await decisionLog.append({
          milestoneId,
          submissionId: sub.id,
          action: 'LLM_VERDICT',
          actor: 'agent:judge',
          verdict: 'ESCALATE',
          confidence: 0,
          inputs: { criteria: milestone.acceptanceCriteria },
          outputs: { error: judgeError },
          model: this.d.llm.model,
        });
      }
      await this.saveInspections(sub, 'llm', [judgeCheck(judge, judgeError, this.d.llm.model)]);

      // 4. Policy gate (final say on money)
      this.step(milestoneId, 'policy_gate', 'Evaluating release policy');
      const evaluation = evaluatePolicy(policy, {
        amountCents: milestone.amountCents,
        currency: milestone.currency,
        verdict: judge?.verdict ?? 'ESCALATE',
        confidence: judge?.confidence ?? 0,
        deterministicPass: summary.deterministicPass,
        checksErrored: summary.errored,
        injectionSuspected: injection.suspected,
        paidTodayCents: await repos.payments.payoutTotalSince(milestone.contractId, startOfUtcDayIso()),
        disputed: Boolean(await repos.disputes.openFor(milestoneId)),
      });
      await this.saveInspections(sub, 'policy', [
        {
          name: 'policy_gate',
          status: evaluation.outcome === 'AUTO_RELEASE' ? 'PASS' : evaluation.outcome === 'REJECT' ? 'FAIL' : 'WARN',
          severity: evaluation.outcome === 'AUTO_RELEASE' ? 'info' : 'medium',
          message: `Policy outcome: ${evaluation.outcome}`,
          evidence: { ...evaluation },
        },
      ]);
      await decisionLog.append({
        milestoneId,
        submissionId: sub.id,
        action: 'POLICY_GATE',
        actor: 'policy-engine',
        inputs: { policy, verdict: judge?.verdict ?? null, confidence: judge?.confidence ?? null },
        outputs: evaluation,
      });

      // 5. Final decision
      const finalVerdict: Verdict = evaluation.outcome === 'AUTO_RELEASE' ? 'APPROVE' : evaluation.outcome;
      const to = finalVerdict === 'APPROVE' ? 'APPROVED' : finalVerdict === 'REJECT' ? 'REJECTED' : 'ESCALATED';
      const decidedAt = nowIso();
      const releaseAt = to === 'APPROVED' ? addSecondsIso(decidedAt, policy.disputeWindowSeconds) : null;
      const text = composeSummary(finalVerdict, summary.failed, injection, judge, judgeError, evaluation.reasons, policy, releaseAt);

      await transitions.transition(milestoneId, to, {
        patch: {
          decision_verdict: finalVerdict,
          decision_confidence: judge?.confidence ?? 0,
          decision_summary: text,
          injection_flag: injection.suspected ? 1 : 0,
          decided_at: decidedAt,
          release_at: releaseAt,
        },
        actorRole: 'agent:verifier',
        reason: text,
      });
      await decisionLog.append({
        milestoneId,
        submissionId: sub.id,
        action: 'FINAL_DECISION',
        actor: 'agent:verifier',
        verdict: finalVerdict,
        confidence: judge?.confidence ?? 0,
        inputs: { deterministicPass: summary.deterministicPass, injection: injection.suspected, llm: judge?.verdict ?? null, policy: evaluation.outcome },
        outputs: { status: to, summary: text, releaseAt },
      });
      this.step(milestoneId, 'decision', `${to}: ${text}`);

      if (to === 'APPROVED' && policy.disputeWindowSeconds === 0) await this.onApproved(milestoneId);
    } catch (err) {
      const message = errorMessage(err);
      this.d.log.error({ err: message, milestoneId }, 'verification failed');
      this.step(milestoneId, 'error', message);
      await decisionLog.append({
        milestoneId,
        submissionId: sub.id,
        action: 'FINAL_DECISION',
        actor: 'agent:verifier',
        verdict: 'ESCALATE',
        confidence: 0,
        inputs: { submissionId: sub.id },
        outputs: { status: 'ESCALATED', error: message },
      });
      const current = await repos.milestones.getRow(milestoneId);
      if (current?.status === 'VERIFYING') {
        await transitions.transition(milestoneId, 'ESCALATED', {
          patch: { decision_verdict: 'ESCALATE', decision_summary: `Verification error — needs human review: ${message}`, decided_at: nowIso() },
          reason: message,
        });
      }
    }
  }

  private async runVerifier(m: MilestoneDTO, sub: SubmissionsTable): Promise<VerifierOutput> {
    const v = m.verification;
    if (v.type !== sub.kind) {
      return {
        checks: [fail('submission_kind', 'high', `This milestone is verified by ${v.type} but the submission is ${sub.kind}`)],
        untrusted: [],
        facts: {},
      };
    }
    switch (v.type) {
      case 'GITHUB_PR':
        return verifyGithubPr(this.d.github, v.params, sub.url ?? '');
      case 'URL':
        return verifyUrl(this.d.fetcher, v.params, sub.url ?? '');
      case 'FILE':
        return verifyFile(v.params, {
          name: sub.file_name ?? 'upload',
          sizeBytes: sub.file_size_bytes ?? 0,
          sha256: sub.file_sha256 ?? '',
          contentBase64: sub.file_content,
        });
    }
  }

  private async saveInspections(sub: SubmissionsTable, category: InspectionCategory, checks: CheckResult[]): Promise<void> {
    const createdAt = nowIso();
    const rows: InspectionsTable[] = checks.map((c) => ({
      id: newId('ins'),
      submission_id: sub.id,
      milestone_id: sub.milestone_id,
      check_name: c.name,
      category,
      status: c.status,
      severity: c.severity,
      injection_flag: category === 'injection' && c.status === 'FAIL' ? 1 : 0,
      message: c.message.slice(0, 1000),
      evidence: JSON.stringify(c.evidence).slice(0, 20_000),
      created_at: createdAt,
    }));
    await this.d.repos.inspections.insertMany(rows);
    this.d.bus.publish({
      type: 'inspection.created',
      milestoneId: sub.milestone_id,
      count: rows.length,
      injectionFlag: rows.some((r) => r.injection_flag === 1),
    });
  }
}

function injectionChecks(r: InjectionReport): CheckResult[] {
  const out: CheckResult[] = [];
  const byRule = new Map<string, (typeof r.heuristic.matches)[number][]>();
  for (const m of r.heuristic.matches) byRule.set(m.ruleId, [...(byRule.get(m.ruleId) ?? []), m]);
  for (const [ruleId, matches] of byRule) {
    out.push({
      name: `injection:${ruleId}`,
      status: r.suspected ? 'FAIL' : 'WARN',
      severity: r.suspected ? r.severity : 'low',
      message: `${matches[0]!.description} (${matches.length} match${matches.length > 1 ? 'es' : ''})`,
      evidence: { rule: ruleId, matches: matches.map((m) => ({ source: m.source, excerpt: m.excerpt })) },
    });
  }
  if (r.classifier || r.classifierError) {
    const flagged = Boolean(r.classifier?.injection);
    out.push({
      name: 'injection:llm_classifier',
      status: r.classifierError ? 'ERROR' : flagged ? (r.suspected ? 'FAIL' : 'WARN') : 'PASS',
      severity: flagged ? r.severity : 'info',
      message: r.classifierError
        ? 'Injection classifier unavailable — heuristics only'
        : flagged
          ? `Classifier flagged injection (confidence ${r.classifier!.confidence.toFixed(2)})`
          : 'Classifier found no injection',
      evidence: { classifier: r.classifier, error: r.classifierError, model: r.model },
    });
  }
  if (out.length === 0) out.push({ name: 'injection_scan', status: 'PASS', severity: 'info', message: 'No prompt-injection patterns found', evidence: {} });
  return out;
}

function judgeCheck(judge: JudgeOutput | null, error: string | null, model: string): CheckResult {
  if (!judge) {
    return { name: 'llm_judgment', status: 'ERROR', severity: 'medium', message: 'LLM judgment unavailable — escalating', evidence: { error, model } };
  }
  return {
    name: 'llm_judgment',
    status: judge.verdict === 'APPROVE' ? 'PASS' : judge.verdict === 'REJECT' ? 'FAIL' : 'WARN',
    severity: judge.verdict === 'APPROVE' ? 'info' : 'medium',
    message: `LLM verdict ${judge.verdict} (confidence ${judge.confidence.toFixed(2)})`,
    evidence: { ...judge, model },
  };
}

function composeSummary(
  verdict: Verdict,
  failed: CheckResult[],
  injection: InjectionReport,
  judge: JudgeOutput | null,
  judgeError: string | null,
  reasons: { rule: string; passed: boolean; detail: string }[],
  policy: PolicyDTO,
  releaseAt: string | null,
): string {
  if (verdict === 'APPROVE') {
    const when = releaseAt ? ` (${releaseAt.slice(11, 19)} UTC)` : '';
    const wait =
      policy.disputeWindowSeconds > 0
        ? ` Payout releases after a ${policy.disputeWindowSeconds}s dispute window${when}.`
        : ' Releasing payout now.';
    return `Approved — all checks passed and the judge is ${Math.round((judge?.confidence ?? 0) * 100)}% confident.${wait}`;
  }
  if (failed.length > 0) {
    const names = failed.map((c) => c.name).slice(0, 4).join(', ');
    return verdict === 'REJECT'
      ? `Rejected — ${failed.length} deterministic check(s) failed: ${names}.`
      : `Escalated — verification could not complete (${names}); a human must review.`;
  }
  if (injection.suspected) {
    return `Escalated — prompt-injection attempt detected (${injection.severity}). Payout blocked pending human review.`;
  }
  if (judgeError) return 'Escalated — the LLM judge was unavailable; a human must review.';
  if (verdict === 'REJECT') return `Rejected — ${judge?.summary ?? 'acceptance criteria not met.'}`.slice(0, 600);
  const firstFailed = reasons.find((r) => !r.passed);
  return `Escalated — ${firstFailed ? firstFailed.detail : 'policy requires human review'}.`;
}
