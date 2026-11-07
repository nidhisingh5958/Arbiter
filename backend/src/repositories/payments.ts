import type { PaymentDTO } from '@arbiter/shared';
import type { DB, PaymentsTable } from '../db/types';
import { toPaymentDTO } from './mappers';

export type PaymentPatch = Partial<Omit<PaymentsTable, 'id' | 'milestone_id' | 'contract_id' | 'kind' | 'created_at'>>;

const ACTIVE_PAYOUT_STATUSES = ['PENDING', 'PROCESSING', 'SUCCESS', 'UNCLAIMED', 'ONHOLD', 'NEW'];

export class PaymentsRepo {
  constructor(private readonly db: DB) {}

  async insert(row: PaymentsTable): Promise<void> {
    await this.db.insertInto('payments').values(row).execute();
  }

  async update(id: string, patch: PaymentPatch): Promise<void> {
    await this.db.updateTable('payments').set(patch).where('id', '=', id).execute();
  }

  async getRow(id: string): Promise<PaymentsTable | null> {
    return (await this.db.selectFrom('payments').selectAll().where('id', '=', id).executeTakeFirst()) ?? null;
  }

  async listRowsByMilestone(milestoneId: string): Promise<PaymentsTable[]> {
    return this.db
      .selectFrom('payments')
      .selectAll()
      .where('milestone_id', '=', milestoneId)
      .orderBy('created_at')
      .execute();
  }

  async findByOrderId(orderId: string, kind?: string): Promise<PaymentsTable | null> {
    let q = this.db.selectFrom('payments').selectAll().where('paypal_order_id', '=', orderId);
    if (kind) q = q.where('kind', '=', kind);
    return (await q.orderBy('created_at', 'desc').executeTakeFirst()) ?? null;
  }

  async findByCaptureId(captureId: string): Promise<PaymentsTable | null> {
    return (
      (await this.db
        .selectFrom('payments')
        .selectAll()
        .where('paypal_capture_id', '=', captureId)
        .where('kind', '=', 'CAPTURE')
        .executeTakeFirst()) ?? null
    );
  }

  async findRefund(refundId: string): Promise<PaymentsTable | null> {
    return (
      (await this.db
        .selectFrom('payments')
        .selectAll()
        .where('refund_id', '=', refundId)
        .where('kind', '=', 'REFUND')
        .executeTakeFirst()) ?? null
    );
  }

  async findByAuthorizationId(authorizationId: string): Promise<PaymentsTable | null> {
    return (
      (await this.db
        .selectFrom('payments')
        .selectAll()
        .where('paypal_authorization_id', '=', authorizationId)
        .where('kind', '=', 'AUTHORIZATION')
        .executeTakeFirst()) ?? null
    );
  }

  async findByBatchId(batchId: string): Promise<PaymentsTable | null> {
    return (
      (await this.db.selectFrom('payments').selectAll().where('payout_batch_id', '=', batchId).executeTakeFirst()) ??
      null
    );
  }

  async findByPayoutItemId(itemId: string): Promise<PaymentsTable | null> {
    return (
      (await this.db.selectFrom('payments').selectAll().where('payout_item_id', '=', itemId).executeTakeFirst()) ?? null
    );
  }

  /** A payout that is in flight or done blocks any second payout for the milestone. */
  async activePayout(milestoneId: string): Promise<PaymentsTable | null> {
    return (
      (await this.db
        .selectFrom('payments')
        .selectAll()
        .where('milestone_id', '=', milestoneId)
        .where('kind', '=', 'PAYOUT')
        .where('status', 'in', ACTIVE_PAYOUT_STATUSES)
        .executeTakeFirst()) ?? null
    );
  }

  async latestOfKind(milestoneId: string, kind: string): Promise<PaymentsTable | null> {
    return (
      (await this.db
        .selectFrom('payments')
        .selectAll()
        .where('milestone_id', '=', milestoneId)
        .where('kind', '=', kind)
        .orderBy('created_at', 'desc')
        .executeTakeFirst()) ?? null
    );
  }

  async pendingPayouts(olderThanIso: string): Promise<PaymentsTable[]> {
    return this.db
      .selectFrom('payments')
      .selectAll()
      .where('kind', '=', 'PAYOUT')
      .where('status', 'in', ['PENDING', 'PROCESSING', 'NEW', 'ONHOLD'])
      .where('updated_at', '<=', olderThanIso)
      .execute();
  }

  async payoutTotalSince(contractId: string, sinceIso: string): Promise<number> {
    const rows = await this.db
      .selectFrom('payments')
      .select('amount_cents')
      .where('contract_id', '=', contractId)
      .where('kind', '=', 'PAYOUT')
      .where('status', 'in', ACTIVE_PAYOUT_STATUSES)
      .where('created_at', '>=', sinceIso)
      .execute();
    return rows.reduce((s, r) => s + r.amount_cents, 0);
  }

  async listDTOs(filter: { milestoneId?: string; limit?: number } = {}): Promise<PaymentDTO[]> {
    let q = this.db
      .selectFrom('payments as p')
      .innerJoin('milestones as m', 'm.id', 'p.milestone_id')
      .innerJoin('contracts as c', 'c.id', 'p.contract_id')
      .selectAll('p')
      .select(['m.title as milestone_title', 'c.title as contract_title']);
    if (filter.milestoneId) q = q.where('p.milestone_id', '=', filter.milestoneId);
    const rows = await q
      .orderBy('p.created_at', 'desc')
      .limit(filter.limit ?? 500)
      .execute();
    return rows.map((r) => toPaymentDTO(r, r.milestone_title, r.contract_title));
  }
}
