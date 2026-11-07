import type { MilestoneDTO, UserDTO } from '@arbiter/shared';
import type { DecisionLog } from '../agent/decisionLog';
import type { ToolGateway } from '../agent/tools/gateway';
import { newId } from '../lib/crypto';
import { conflict, forbidden, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import type { Repositories } from '../repositories';
import { actorOf, isBuyerOf, isContractorOf } from './access';
import type { PayoutService } from './payouts';
import type { MilestoneTransitions } from './transitions';
import type { VerificationService } from './verification';

export interface DisputeDeps {
  repos: Repositories;
  decisionLog: DecisionLog;
  transitions: MilestoneTransitions;
  gateway: ToolGateway;
  payouts: PayoutService;
  verification: VerificationService;
}

/** Disputes, human overrides, refunds and dispute-window waivers. */
export class DisputeService {
  constructor(private readonly d: DisputeDeps) {}

  private async load(milestoneId: string) {
    const m = await this.d.repos.milestones.getRow(milestoneId);
    if (!m) throw notFound('Milestone');
    const c = await this.d.repos.contracts.getRow(m.contract_id);
    if (!c) throw notFound('Contract');
    return { m, c };
  }

  private async dto(id: string): Promise<MilestoneDTO> {
    const dto = await this.d.repos.milestones.getDTO(id);
    if (!dto) throw notFound('Milestone');
    return dto;
  }

  async raise(user: UserDTO, milestoneId: string, reason: string): Promise<MilestoneDTO> {
    const { m, c } = await this.load(milestoneId);
    const buyerOk = isBuyerOf(user, c) && m.status === 'APPROVED';
    const contractorOk = isContractorOf(user, c) && (m.status === 'REJECTED' || m.status === 'ESCALATED');
    if (!buyerOk && !contractorOk) {
      throw forbidden(
        isBuyerOf(user, c)
          ? 'Buyers can dispute an approval before the payout is released'
          : isContractorOf(user, c)
            ? 'Contractors can dispute a rejection or escalation'
            : 'Only the buyer or contractor can raise a dispute',
      );
    }
    if (buyerOk && (await this.d.repos.payments.activePayout(m.id))) throw conflict('The payout has already been released');

    await this.d.repos.disputes.insert({
      id: newId('dsp'),
      milestone_id: m.id,
      raised_by: user.id,
      raised_by_role: user.role,
      reason,
      status: 'OPEN',
      resolution: null,
      resolved_by: null,
      created_at: nowIso(),
      resolved_at: null,
    });
    await this.d.transitions.transition(m.id, 'DISPUTED', {
      patch: { release_at: null },
      actorId: user.id,
      actorRole: user.role,
      reason: `Dispute raised: ${reason}`,
    });
    await this.d.decisionLog.append({
      milestoneId: m.id,
      action: 'DISPUTE',
      actor: actorOf(user),
      inputs: { reason, previousStatus: m.status },
      outputs: { status: 'DISPUTED', payoutPaused: true },
    });
    return this.dto(m.id);
  }

  async resolve(user: UserDTO, milestoneId: string, action: 'APPROVE' | 'REJECT', note: string): Promise<MilestoneDTO> {
    const { m, c } = await this.load(milestoneId);
    const isAdmin = user.role === 'admin';
    if (m.status === 'ESCALATED') {
      if (!(isAdmin || isBuyerOf(user, c))) throw forbidden('Only the buyer or an admin can resolve an escalation');
    } else if (m.status === 'DISPUTED') {
      if (!isAdmin) throw forbidden('Disputes are resolved by a neutral admin — switch to the admin role');
    } else {
      throw conflict(`Nothing to resolve: milestone is ${m.status}`);
    }

    const dispute = await this.d.repos.disputes.openFor(m.id);
    const ts = nowIso();
    await this.d.decisionLog.append({
      milestoneId: m.id,
      action: 'HUMAN_OVERRIDE',
      actor: actorOf(user),
      verdict: action,
      confidence: 1,
      inputs: { note, previousStatus: m.status, agentVerdict: m.decision_verdict, disputeId: dispute?.id ?? null },
      outputs: { status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', role: user.role },
    });
    if (dispute) await this.d.repos.disputes.resolve(dispute.id, action === 'APPROVE' ? 'RESOLVED_RELEASE' : 'RESOLVED_REJECT', note, user.id);

    if (action === 'APPROVE') {
      await this.d.transitions.transition(m.id, 'APPROVED', {
        patch: {
          decision_verdict: 'APPROVE',
          decision_confidence: 1,
          decision_summary: `Approved by ${user.role} ${user.name} (human override): ${note}`,
          decided_at: ts,
          release_at: ts,
        },
        actorId: user.id,
        actorRole: user.role,
        reason: note,
      });
      await this.d.payouts.release(m.id, 'human', user.id);
    } else {
      await this.d.transitions.transition(m.id, 'REJECTED', {
        patch: { decision_verdict: 'REJECT', decision_confidence: 1, decision_summary: `Rejected by ${user.role} ${user.name}: ${note}`, decided_at: ts, release_at: null },
        actorId: user.id,
        actorRole: user.role,
        reason: note,
      });
    }
    return this.dto(m.id);
  }

  async refund(user: UserDTO, milestoneId: string, reason: string): Promise<MilestoneDTO> {
    const { m, c } = await this.load(milestoneId);
    if (!(user.role === 'admin' || isBuyerOf(user, c))) throw forbidden('Only the buyer or an admin can refund a milestone');
    if (!['FUNDED', 'REJECTED', 'ESCALATED'].includes(m.status)) throw conflict(`A ${m.status} milestone cannot be refunded`);
    await this.d.gateway.executeOrThrow('refund_capture', { milestone_id: m.id, reason }, { actor: actorOf(user) });
    await this.d.transitions.transition(m.id, 'REFUNDED', { patch: { release_at: null }, actorId: user.id, actorRole: user.role, reason });
    await this.d.transitions.activateNext(m.contract_id);
    return this.dto(m.id);
  }

  async waiveWindow(user: UserDTO, milestoneId: string): Promise<MilestoneDTO> {
    const { m, c } = await this.load(milestoneId);
    if (!isBuyerOf(user, c)) throw forbidden('Only the buyer can waive the dispute window');
    if (m.status !== 'APPROVED') throw conflict(`Milestone is ${m.status}; only approved milestones can be released early`);
    await this.d.repos.milestones.patch(m.id, { release_at: nowIso() }, nowIso());
    await this.d.repos.audit.append({
      actorId: user.id,
      actorRole: user.role,
      action: 'dispute_window.waived',
      entityType: 'milestone',
      entityId: m.id,
      details: {},
    });
    await this.d.payouts.release(m.id, 'waiver');
    return this.dto(m.id);
  }

  async reverify(user: UserDTO, milestoneId: string): Promise<MilestoneDTO> {
    if (user.role !== 'admin') throw forbidden('Only an admin can re-run verification');
    const { m } = await this.load(milestoneId);
    if (!['REJECTED', 'ESCALATED'].includes(m.status)) throw conflict(`Cannot re-verify a ${m.status} milestone`);
    const sub = await this.d.repos.submissions.latestRow(m.id);
    if (!sub) throw conflict('There is no submission to verify');
    this.d.verification.verifyInBackground(sub.id);
    return this.dto(m.id);
  }
}
