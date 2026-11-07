import type { PolicyEvaluation, PolicyInput, PolicyRuleResult, Verdict } from '@arbiter/shared';
import { formatMoney } from '@arbiter/shared';

export interface PolicyContext {
  amountCents: number;
  currency: string;
  verdict: Verdict;
  confidence: number;
  deterministicPass: boolean;
  checksErrored: boolean;
  injectionSuspected: boolean;
  paidTodayCents: number;
  disputed: boolean;
}

/**
 * The policy engine — not the LLM — decides whether money may move automatically.
 * Pure and deterministic so every outcome is reproducible from the decision log.
 */
export function evaluatePolicy(policy: PolicyInput, ctx: PolicyContext, now = new Date()): PolicyEvaluation {
  const money = (c: number) => formatMoney(c, ctx.currency);
  const reasons: PolicyRuleResult[] = [
    {
      rule: 'deterministic_gate',
      passed: ctx.deterministicPass,
      detail: ctx.deterministicPass ? 'All deterministic checks passed' : 'One or more deterministic checks failed or errored',
    },
    {
      rule: 'injection_gate',
      passed: !ctx.injectionSuspected,
      detail: ctx.injectionSuspected ? 'Prompt-injection attempt detected in submitted content' : 'No injection detected',
    },
    { rule: 'llm_verdict', passed: ctx.verdict === 'APPROVE', detail: `LLM verdict is ${ctx.verdict}` },
    {
      rule: 'confidence_threshold',
      passed: ctx.confidence >= policy.minConfidence,
      detail: `Confidence ${ctx.confidence.toFixed(2)} vs minimum ${policy.minConfidence.toFixed(2)}`,
    },
    {
      rule: 'auto_release_limit',
      passed: ctx.amountCents <= policy.maxAutoReleaseCents,
      detail: `${money(ctx.amountCents)} vs auto-release limit ${money(policy.maxAutoReleaseCents)}`,
    },
    {
      rule: 'human_approval_threshold',
      passed: ctx.amountCents <= policy.humanApprovalAboveCents,
      detail:
        ctx.amountCents <= policy.humanApprovalAboveCents
          ? `${money(ctx.amountCents)} does not require human approval`
          : `Amounts above ${money(policy.humanApprovalAboveCents)} require human approval`,
    },
    {
      rule: 'daily_payout_cap',
      passed: ctx.paidTodayCents + ctx.amountCents <= policy.dailyPayoutCapCents,
      detail: `${money(ctx.paidTodayCents)} already released today + ${money(ctx.amountCents)} vs cap ${money(policy.dailyPayoutCapCents)}`,
    },
    { rule: 'no_open_dispute', passed: !ctx.disputed, detail: ctx.disputed ? 'An open dispute pauses payouts' : 'No open dispute' },
  ];

  let outcome: PolicyEvaluation['outcome'];
  if (!ctx.deterministicPass) outcome = ctx.checksErrored ? 'ESCALATE' : 'REJECT';
  else if (ctx.injectionSuspected) outcome = 'ESCALATE';
  else if (ctx.verdict === 'REJECT') outcome = 'REJECT';
  else if (reasons.every((r) => r.passed)) outcome = 'AUTO_RELEASE';
  else outcome = 'ESCALATE';

  return { outcome, reasons, evaluatedAt: now.toISOString() };
}
