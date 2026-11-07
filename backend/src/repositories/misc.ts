import type { DisputeDTO, PolicyDTO, PolicyInput, WebhookEventDTO } from '@arbiter/shared';
import type { AuditLogTable, DB, DisputesTable, WebhookEventsTable } from '../db/types';
import { newId } from '../lib/crypto';
import { nowIso } from '../lib/time';
import { toDisputeDTO, toPolicyDTO, toWebhookDTO } from './mappers';

export class PoliciesRepo {
  constructor(private readonly db: DB) {}

  async create(contractId: string, p: PolicyInput): Promise<void> {
    const ts = nowIso();
    await this.db
      .insertInto('policies')
      .values({
        id: newId('pol'),
        contract_id: contractId,
        max_auto_release_cents: p.maxAutoReleaseCents,
        min_confidence: p.minConfidence,
        daily_payout_cap_cents: p.dailyPayoutCapCents,
        human_approval_above_cents: p.humanApprovalAboveCents,
        dispute_window_seconds: p.disputeWindowSeconds,
        created_at: ts,
        updated_at: ts,
      })
      .execute();
  }

  async update(contractId: string, p: PolicyInput): Promise<void> {
    await this.db
      .updateTable('policies')
      .set({
        max_auto_release_cents: p.maxAutoReleaseCents,
        min_confidence: p.minConfidence,
        daily_payout_cap_cents: p.dailyPayoutCapCents,
        human_approval_above_cents: p.humanApprovalAboveCents,
        dispute_window_seconds: p.disputeWindowSeconds,
        updated_at: nowIso(),
      })
      .where('contract_id', '=', contractId)
      .execute();
  }

  async getByContract(contractId: string): Promise<PolicyDTO | null> {
    const row = await this.db.selectFrom('policies').selectAll().where('contract_id', '=', contractId).executeTakeFirst();
    return row ? toPolicyDTO(row) : null;
  }
}

export class DisputesRepo {
  constructor(private readonly db: DB) {}

  async insert(row: DisputesTable): Promise<void> {
    await this.db.insertInto('disputes').values(row).execute();
  }

  async openFor(milestoneId: string): Promise<DisputesTable | null> {
    return (
      (await this.db
        .selectFrom('disputes')
        .selectAll()
        .where('milestone_id', '=', milestoneId)
        .where('status', '=', 'OPEN')
        .executeTakeFirst()) ?? null
    );
  }

  async resolve(id: string, status: string, resolution: string, resolvedBy: string): Promise<void> {
    await this.db
      .updateTable('disputes')
      .set({ status, resolution, resolved_by: resolvedBy, resolved_at: nowIso() })
      .where('id', '=', id)
      .execute();
  }

  async listByMilestone(milestoneId: string): Promise<DisputeDTO[]> {
    const rows = await this.db
      .selectFrom('disputes')
      .selectAll()
      .where('milestone_id', '=', milestoneId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDisputeDTO);
  }

  async countOpen(): Promise<number> {
    const rows = await this.db.selectFrom('disputes').select('id').where('status', '=', 'OPEN').execute();
    return rows.length;
  }
}

export class WebhookEventsRepo {
  constructor(private readonly db: DB) {}

  async get(id: string): Promise<WebhookEventsTable | null> {
    return (await this.db.selectFrom('webhook_events').selectAll().where('id', '=', id).executeTakeFirst()) ?? null;
  }

  /** Returns true if inserted, false if the event id already existed (idempotency). */
  async insertIfNew(row: WebhookEventsTable): Promise<boolean> {
    const res = await this.db
      .insertInto('webhook_events')
      .values(row)
      .onConflict((oc) => oc.column('id').doNothing())
      .executeTakeFirst();
    return Number(res.numInsertedOrUpdatedRows ?? 0) === 1;
  }

  async markVerified(id: string, payload: string): Promise<void> {
    await this.db
      .updateTable('webhook_events')
      .set({ verified: 1, error: null, payload, received_at: nowIso() })
      .where('id', '=', id)
      .execute();
  }

  async bumpDuplicate(id: string): Promise<void> {
    const row = await this.get(id);
    if (!row) return;
    await this.db
      .updateTable('webhook_events')
      .set({ duplicate_count: row.duplicate_count + 1 })
      .where('id', '=', id)
      .execute();
  }

  async markProcessed(id: string, error: string | null): Promise<void> {
    await this.db
      .updateTable('webhook_events')
      .set({ processed: error ? 0 : 1, error, processed_at: nowIso() })
      .where('id', '=', id)
      .execute();
  }

  async list(limit = 300): Promise<WebhookEventDTO[]> {
    const rows = await this.db
      .selectFrom('webhook_events')
      .selectAll()
      .orderBy('received_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map(toWebhookDTO);
  }
}

export interface AuditEntry {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export class AuditRepo {
  constructor(private readonly db: DB) {}

  async append(e: AuditEntry): Promise<void> {
    const row: AuditLogTable = {
      id: newId('aud'),
      actor_id: e.actorId,
      actor_role: e.actorRole,
      action: e.action,
      entity_type: e.entityType,
      entity_id: e.entityId,
      details: JSON.stringify(e.details ?? {}),
      created_at: nowIso(),
    };
    await this.db.insertInto('audit_log').values(row).execute();
  }
}
