import {
  JudgeOutputSchema,
  computeAllowedActions,
  isEscrowed,
  type AgentDecisionDTO,
  type DashboardSummaryDTO,
  type InspectionDTO,
  type MilestoneDTO,
  type PaymentDTO,
  type PolicyEvaluation,
  type ReviewDTO,
  type UserDTO,
  type WebhookEventDTO,
} from '@arbiter/shared';
import type { DecisionLog } from '../agent/decisionLog';
import { notFound } from '../lib/errors';
import type { Repositories } from '../repositories';
import { assertCanView, isBuyerOf, isContractorOf } from './access';

/** Read models: the review screen and the telemetry dashboard. */
export class InsightsService {
  constructor(
    private readonly repos: Repositories,
    private readonly decisionLog: DecisionLog,
  ) {}

  async review(user: UserDTO, milestoneId: string): Promise<ReviewDTO> {
    const milestone = await this.repos.milestones.getDTO(milestoneId);
    if (!milestone) throw notFound('Milestone');
    const row = await this.repos.contracts.getRow(milestone.contractId);
    if (!row) throw notFound('Contract');
    assertCanView(user, row);

    const [contract, policy, submissions, inspections, decisions, payments, disputes, activePayout] = await Promise.all([
      this.repos.contracts.getDTO(row.id),
      this.repos.policies.getByContract(row.id),
      this.repos.submissions.listByMilestone(milestoneId),
      this.repos.inspections.listByMilestone(milestoneId),
      this.decisionLog.listByMilestone(milestoneId),
      this.repos.payments.listDTOs({ milestoneId }),
      this.repos.disputes.listByMilestone(milestoneId),
      this.repos.payments.activePayout(milestoneId),
    ]);
    if (!contract || !policy) throw notFound('Contract');

    const latestJudge = [...decisions].reverse().find((d) => d.action === 'LLM_VERDICT');
    const judgeParsed = latestJudge ? JudgeOutputSchema.safeParse(latestJudge.outputs) : null;
    const latestGate = [...decisions].reverse().find((d) => d.action === 'POLICY_GATE' && isEvaluation(d.outputs));

    return {
      milestone,
      contract,
      policy,
      submissions,
      latestSubmission: submissions[0] ?? null,
      inspections,
      decisions,
      payments,
      disputes,
      judge: judgeParsed?.success ? judgeParsed.data : null,
      policyGate: latestGate ? (latestGate.outputs as PolicyEvaluation) : null,
      allowedActions: computeAllowedActions({
        status: milestone.status,
        role: user.role,
        isBuyer: isBuyerOf(user, row),
        isContractor: isContractorOf(user, row),
        hasPayout: Boolean(activePayout),
      }),
    };
  }

  private async visibleMilestones(user: UserDTO): Promise<MilestoneDTO[]> {
    if (user.role === 'admin') return this.repos.milestones.listAll();
    return user.role === 'buyer'
      ? this.repos.milestones.listAll({ buyerId: user.id })
      : this.repos.milestones.listAll({ contractorId: user.id });
  }

  async summary(user: UserDTO): Promise<DashboardSummaryDTO> {
    const ms = await this.visibleMilestones(user);
    const statusCounts: DashboardSummaryDTO['statusCounts'] = {};
    for (const m of ms) statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
    const paid = ms.filter((m) => m.status === 'PAID');
    const durations = paid
      .filter((m) => m.submittedAt && m.paidAt)
      .map((m) => (Date.parse(m.paidAt!) - Date.parse(m.submittedAt!)) / 1000)
      .filter((s) => s >= 0);
    const sum = (list: MilestoneDTO[]) => list.reduce((s, m) => s + m.amountCents, 0);
    const injected = new Set(ms.filter((m) => m.injectionFlag).map((m) => m.id));
    return {
      currency: 'USD',
      totalEscrowedCents: sum(ms.filter((m) => isEscrowed(m.status))),
      totalReleasedCents: sum(paid),
      pendingFundingCents: sum(ms.filter((m) => m.status === 'FUNDING_REQUIRED')),
      inReviewCount: ms.filter((m) => m.status === 'SUBMITTED' || m.status === 'VERIFYING').length,
      escalationCount: statusCounts.ESCALATED ?? 0,
      disputeCount: statusCounts.DISPUTED ?? 0,
      paidCount: paid.length,
      injectionFlags: injected.size,
      avgTimeToPayoutSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      statusCounts,
    };
  }

  async milestones(user: UserDTO): Promise<MilestoneDTO[]> {
    return this.visibleMilestones(user);
  }

  private async visibleIds(user: UserDTO): Promise<Set<string> | null> {
    if (user.role === 'admin') return null;
    return new Set((await this.visibleMilestones(user)).map((m) => m.id));
  }

  async inspections(user: UserDTO): Promise<InspectionDTO[]> {
    const ids = await this.visibleIds(user);
    const all = await this.repos.inspections.listRecent(800);
    return ids ? all.filter((i) => ids.has(i.milestoneId)) : all;
  }

  async transactions(user: UserDTO): Promise<PaymentDTO[]> {
    const ids = await this.visibleIds(user);
    const all = await this.repos.payments.listDTOs({ limit: 800 });
    return ids ? all.filter((p) => ids.has(p.milestoneId)) : all;
  }

  async decisions(user: UserDTO): Promise<AgentDecisionDTO[]> {
    const ids = await this.visibleIds(user);
    const all = await this.decisionLog.listRecent(800);
    return ids ? all.filter((d) => d.milestoneId === null || ids.has(d.milestoneId)) : all;
  }

  async webhooks(): Promise<WebhookEventDTO[]> {
    return this.repos.webhookEvents.list(300);
  }
}

function isEvaluation(v: unknown): v is PolicyEvaluation {
  return Boolean(v && typeof v === 'object' && 'outcome' in v && 'reasons' in v && Array.isArray((v as PolicyEvaluation).reasons));
}
