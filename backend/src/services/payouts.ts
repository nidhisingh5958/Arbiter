import type { PolicyEvaluation } from '@arbiter/shared';
import type { DecisionLog } from '../agent/decisionLog';
import { evaluatePolicy } from '../agent/policy/engine';
import type { ReleaseGrant, ReleaseGrants } from '../agent/policy/grants';
import { runReleaseAgent } from '../agent/releaseAgent';
import type { ToolGateway } from '../agent/tools/gateway';
import type { MilestonesTable, PaymentsTable } from '../db/types';
import { errorMessage } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { KeyedMutex } from '../lib/mutex';
import { nowIso, startOfUtcDayIso } from '../lib/time';
import type { LlmProvider } from '../llm';
import type { PayPalGateway } from '../paypal/types';
import type { EventBus } from '../realtime/eventBus';
import type { Repositories } from '../repositories';
import type { MilestoneTransitions } from './transitions';

export interface PayoutDeps {
  repos: Repositories;
  llm: LlmProvider;
  gateway: ToolGateway;
  grants: ReleaseGrants;
  paypal: PayPalGateway;
  decisionLog: DecisionLog;
  transitions: MilestoneTransitions;
  bus: EventBus;
  log: Logger;
}

export type ReleaseTrigger = 'scheduler' | 'human' | 'waiver';

const SUCCESS = new Set(['SUCCESS']);
const FAILED = new Set(['FAILED', 'RETURNED', 'BLOCKED', 'DENIED', 'REFUNDED', 'REVERSED', 'CANCELED']);

/** Normalizes PayPal payout batch/item statuses into one payment status. */
export function payoutStatusFrom(batchStatus: string | null, itemStatus: string | null): string {
  if (itemStatus) return itemStatus.toUpperCase();
  const b = (batchStatus ?? 'PENDING').toUpperCase();
  return b === 'DENIED' ? 'DENIED' : b === 'CANCELED' ? 'CANCELED' : b === 'SUCCESS' ? 'PROCESSING' : b;
}

export class PayoutService {
  private readonly lock = new KeyedMutex();

  constructor(private readonly d: PayoutDeps) {}

  async releaseDue(): Promise<void> {
    const due = await this.d.repos.milestones.dueForRelease(nowIso());
    for (const m of due) {
      try {
        await this.release(m.id, 'scheduler');
      } catch (err) {
        this.d.log.error({ err: errorMessage(err), milestoneId: m.id }, 'scheduled release failed');
      }
    }
  }

  /** Policy-gated release: issue a grant (or escalate), then let the payments agent call the tool. */
  async release(milestoneId: string, trigger: ReleaseTrigger, humanActorId?: string): Promise<void> {
    await this.lock.run(milestoneId, async () => {
      const { repos } = this.d;
      const m = await repos.milestones.getRow(milestoneId);
      if (!m || m.status !== 'APPROVED') return;
      if (await repos.payments.activePayout(m.id)) return;
      if (await repos.disputes.openFor(m.id)) return;

      let grant: ReleaseGrant;
      let evaluation: PolicyEvaluation | null = null;
      const humanApproved = trigger === 'human' || (await this.isHumanApproved(m.id));

      if (humanApproved) {
        grant = await this.d.grants.issue(m.id, m.amount_cents, 'HUMAN', humanActorId ? `user:${humanActorId}` : 'human-override');
        await this.d.decisionLog.append({
          milestoneId: m.id,
          action: 'POLICY_GATE',
          actor: 'policy-engine',
          inputs: { trigger, kind: 'HUMAN' },
          outputs: { outcome: 'RELEASE_GRANTED', grant: { id: grant.id, kind: 'HUMAN', expiresAt: grant.expiresAt } },
        });
      } else {
        evaluation = await this.reevaluate(m);
        await this.d.decisionLog.append({
          milestoneId: m.id,
          action: 'POLICY_GATE',
          actor: 'policy-engine',
          inputs: { trigger, phase: 'release' },
          outputs: evaluation,
        });
        if (evaluation.outcome !== 'AUTO_RELEASE') {
          const failed = evaluation.reasons.find((r) => !r.passed);
          await this.d.transitions.transition(m.id, 'ESCALATED', {
            patch: { decision_verdict: 'ESCALATE', decision_summary: `Release blocked by policy — ${failed?.detail ?? 'needs human review'}.`, release_at: null },
            actorRole: 'policy-engine',
            reason: 'Policy re-check at release time failed',
          });
          return;
        }
        grant = await this.d.grants.issue(m.id, m.amount_cents, 'AUTO', 'policy-engine');
      }

      this.d.bus.publish({ type: 'agent.step', milestoneId: m.id, step: 'release', detail: 'Payments agent is releasing the payout' });
      const result = await runReleaseAgent(this.d.llm, this.d.gateway, m, grant, evaluation);
      if (result.calls.some((c) => c.ok && (c.name === 'create_payout' || c.name === 'hold_milestone'))) return;

      // The model failed or did nothing useful: fall back to a deterministic, still grant-gated call.
      let lastError = result.error ?? result.calls.find((c) => !c.ok)?.error ?? 'payments agent made no tool call';
      const alreadyConsumed = result.calls.some((c) => c.name === 'create_payout');
      if (!alreadyConsumed) {
        const fallback = await this.d.gateway.execute(
          'create_payout',
          { milestone_id: m.id, memo: 'Released by ArbiterAI (deterministic fallback)' },
          { actor: 'agent:fallback', grantToken: grant.token },
        );
        if (fallback.ok) return;
        lastError = fallback.error;
      }
      const current = await repos.milestones.getRow(m.id);
      if (current?.status === 'APPROVED') {
        await this.d.transitions.transition(m.id, 'ESCALATED', {
          patch: { decision_verdict: 'ESCALATE', decision_summary: `Payout could not be created — ${lastError}`, release_at: null },
          reason: lastError,
        });
      }
    });
  }

  private async isHumanApproved(milestoneId: string): Promise<boolean> {
    const human = await this.d.decisionLog.latest(milestoneId, 'HUMAN_OVERRIDE');
    if (!human || human.verdict !== 'APPROVE') return false;
    const final = await this.d.decisionLog.latest(milestoneId, 'FINAL_DECISION');
    return !final || human.seq > final.seq;
  }

  private async reevaluate(m: MilestonesTable): Promise<PolicyEvaluation> {
    const policy = await this.d.repos.policies.getByContract(m.contract_id);
    if (!policy) throw new Error('Contract policy missing');
    return evaluatePolicy(policy, {
      amountCents: m.amount_cents,
      currency: m.currency,
      verdict: m.decision_verdict === 'APPROVE' ? 'APPROVE' : 'ESCALATE',
      confidence: m.decision_confidence ?? 0,
      deterministicPass: true,
      checksErrored: false,
      injectionSuspected: m.injection_flag === 1,
      paidTodayCents: await this.d.repos.payments.payoutTotalSince(m.contract_id, startOfUtcDayIso()),
      disputed: Boolean(await this.d.repos.disputes.openFor(m.id)),
    });
  }

  /** Polls PayPal for payouts that have not settled (complements webhooks, which may not reach localhost). */
  async pollPending(): Promise<void> {
    const pending = await this.d.repos.payments.pendingPayouts(new Date(Date.now() - 4_000).toISOString());
    for (const p of pending) {
      if (!p.payout_batch_id) continue;
      try {
        const res = await this.d.paypal.getPayoutBatch(p.payout_batch_id);
        await this.applyPayoutStatus(p, { batchStatus: res.batchStatus, itemStatus: res.itemStatus, itemId: res.itemId, feeCents: res.feeCents, source: 'POLL' });
      } catch (err) {
        this.d.log.warn({ err: errorMessage(err), batch: p.payout_batch_id }, 'payout poll failed');
        await this.d.repos.payments.update(p.id, { updated_at: nowIso() });
      }
    }
  }

  /** Idempotently applies a payout status from a webhook or poll and settles the milestone. */
  async applyPayoutStatus(
    payment: PaymentsTable,
    u: { batchStatus: string | null; itemStatus: string | null; itemId: string | null; feeCents: number | null; source: 'WEBHOOK' | 'POLL'; eventId?: string },
  ): Promise<void> {
    await this.lock.run(payment.milestone_id, async () => {
      const { repos } = this.d;
      const fresh = (await repos.payments.getRow(payment.id)) ?? payment;
      const status = payoutStatusFrom(u.batchStatus, u.itemStatus);
      const changed = status !== fresh.status || (u.itemId && u.itemId !== fresh.payout_item_id);
      await repos.payments.update(fresh.id, {
        status,
        payout_item_id: u.itemId ?? fresh.payout_item_id,
        fee_cents: u.feeCents ?? fresh.fee_cents,
        source: u.source,
        last_event_id: u.eventId ?? fresh.last_event_id,
        updated_at: nowIso(),
      });
      if (!changed) return;
      this.d.bus.publish({ type: 'payment.updated', paymentId: fresh.id, milestoneId: fresh.milestone_id, kind: 'PAYOUT', status });

      const m = await repos.milestones.getRow(fresh.milestone_id);
      if (!m || m.status !== 'APPROVED') return;
      if (SUCCESS.has(status)) {
        await this.d.transitions.transition(m.id, 'PAID', { patch: { paid_at: nowIso(), release_at: null }, reason: `Payout ${status} via ${u.source}` });
        await this.d.transitions.activateNext(m.contract_id);
      } else if (FAILED.has(status)) {
        await this.d.transitions.transition(m.id, 'ESCALATED', {
          patch: { decision_verdict: 'ESCALATE', decision_summary: `PayPal payout ${status} — needs attention`, release_at: null },
          reason: `Payout ${status}`,
        });
      }
    });
  }
}
