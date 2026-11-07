import type {
  ContractDetailDTO,
  ContractDTO,
  CreateContractInput,
  ExtractRequest,
  ExtractResponseDTO,
  PolicyInput,
  UserDTO,
} from '@arbiter/shared';
import type { AppConfig } from '../config/env';
import type { DB } from '../db/types';
import type { DecisionLog } from '../agent/decisionLog';
import { extractContract } from '../agent/extractor';
import { newId, sha256Hex } from '../lib/crypto';
import { badRequest, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import type { LlmProvider } from '../llm';
import type { EventBus } from '../realtime/eventBus';
import type { Repositories } from '../repositories';
import { assertCanView, isBuyerOf, requireRole } from './access';
import type { MilestoneTransitions } from './transitions';
import { forbidden } from '../lib/errors';

export interface ContractDeps {
  config: AppConfig;
  db: DB;
  repos: Repositories;
  llm: LlmProvider;
  decisionLog: DecisionLog;
  transitions: MilestoneTransitions;
  bus: EventBus;
}

export class ContractService {
  constructor(private readonly d: ContractDeps) {}

  async extract(user: UserDTO, req: ExtractRequest): Promise<ExtractResponseDTO> {
    requireRole(user, ['buyer', 'admin'], 'draft contracts');
    const res = await extractContract(this.d.llm, req.sowText, req.currencyHint);
    await this.d.decisionLog.append({
      milestoneId: null,
      action: 'EXTRACTION',
      actor: 'agent:extractor',
      inputs: { sowSha256: sha256Hex(req.sowText), chars: req.sowText.length, requestedBy: user.id },
      outputs: { draft: res.draft, issues: res.issues },
      model: res.model,
      usage: res.usage,
      latencyMs: res.latencyMs,
    });
    return { draft: res.draft, issues: res.issues, model: res.model, usage: res.usage };
  }

  async create(user: UserDTO, input: CreateContractInput): Promise<ContractDetailDTO> {
    requireRole(user, ['buyer'], 'create contracts');
    const contractor = await this.d.repos.users.get(input.contractorId);
    if (!contractor || contractor.role !== 'contractor') throw badRequest('Choose a contractor for this contract');

    const policy: PolicyInput = input.policy ?? this.d.config.policyDefaults;
    const { draft } = input;
    const contractId = newId('ctr');
    const ts = nowIso();
    const milestoneIds = draft.milestones.map(() => newId('ms'));

    await this.d.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('contracts')
        .values({
          id: contractId,
          title: draft.title,
          summary: draft.summary,
          sow_text: input.sowText,
          buyer_id: user.id,
          contractor_id: contractor.id,
          currency: draft.currency,
          total_cents: draft.totalCents,
          status: 'ACTIVE',
          created_at: ts,
          updated_at: ts,
        })
        .execute();
      for (const [i, m] of draft.milestones.entries()) {
        await trx
          .insertInto('milestones')
          .values({
            id: milestoneIds[i]!,
            contract_id: contractId,
            seq: i + 1,
            title: m.title,
            description: m.description,
            acceptance_criteria: JSON.stringify(m.acceptanceCriteria),
            amount_cents: m.amountCents,
            currency: m.currency,
            deadline: m.deadline,
            verification: JSON.stringify(m.verification),
            status: 'PENDING',
            decision_verdict: null,
            decision_confidence: null,
            decision_summary: null,
            injection_flag: 0,
            release_at: null,
            funded_at: null,
            submitted_at: null,
            decided_at: null,
            paid_at: null,
            created_at: ts,
            updated_at: ts,
          })
          .execute();
      }
      await trx
        .insertInto('policies')
        .values({
          id: newId('pol'),
          contract_id: contractId,
          max_auto_release_cents: policy.maxAutoReleaseCents,
          min_confidence: policy.minConfidence,
          daily_payout_cap_cents: policy.dailyPayoutCapCents,
          human_approval_above_cents: policy.humanApprovalAboveCents,
          dispute_window_seconds: policy.disputeWindowSeconds,
          created_at: ts,
          updated_at: ts,
        })
        .execute();
    });

    await this.d.repos.audit.append({
      actorId: user.id,
      actorRole: user.role,
      action: 'contract.created',
      entityType: 'contract',
      entityId: contractId,
      details: { milestones: milestoneIds.length, totalCents: draft.totalCents, policy },
    });
    this.d.bus.publish({ type: 'contract.created', contractId, title: draft.title });
    await this.d.transitions.transition(milestoneIds[0]!, 'FUNDING_REQUIRED', {
      actorId: user.id,
      actorRole: user.role,
      reason: 'Contract confirmed; first milestone awaits funding',
    });
    return this.getDetail(user, contractId);
  }

  async list(user: UserDTO): Promise<ContractDTO[]> {
    if (user.role === 'admin') return this.d.repos.contracts.listDTOs();
    return user.role === 'buyer'
      ? this.d.repos.contracts.listDTOs({ buyerId: user.id })
      : this.d.repos.contracts.listDTOs({ contractorId: user.id });
  }

  async getDetail(user: UserDTO, id: string): Promise<ContractDetailDTO> {
    const row = await this.d.repos.contracts.getRow(id);
    if (!row) throw notFound('Contract');
    assertCanView(user, row);
    const [dto, milestones, policy, buyer, contractor] = await Promise.all([
      this.d.repos.contracts.getDTO(id),
      this.d.repos.milestones.listByContract(id),
      this.d.repos.policies.getByContract(id),
      this.d.repos.users.get(row.buyer_id),
      this.d.repos.users.get(row.contractor_id),
    ]);
    if (!dto || !policy || !buyer || !contractor) throw notFound('Contract');
    return { ...dto, sowText: row.sow_text, milestones, policy, buyer, contractor };
  }

  async updatePolicy(user: UserDTO, id: string, policy: PolicyInput): Promise<ContractDetailDTO> {
    const row = await this.d.repos.contracts.getRow(id);
    if (!row) throw notFound('Contract');
    if (!(isBuyerOf(user, row) || user.role === 'admin')) throw forbidden('Only the buyer or an admin can change the release policy');
    await this.d.repos.policies.update(id, policy);
    await this.d.repos.audit.append({
      actorId: user.id,
      actorRole: user.role,
      action: 'policy.updated',
      entityType: 'contract',
      entityId: id,
      details: { ...policy },
    });
    this.d.bus.publish({ type: 'contract.updated', contractId: id });
    return this.getDetail(user, id);
  }
}
