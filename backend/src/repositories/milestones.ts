import type { MilestoneDTO } from '@arbiter/shared';
import type { DB, MilestonesTable } from '../db/types';
import { toMilestoneDTO } from './mappers';

/** Fields that may be patched alongside a status transition. Status itself is never patched here. */
export type MilestonePatch = Partial<
  Pick<
    MilestonesTable,
    | 'decision_verdict'
    | 'decision_confidence'
    | 'decision_summary'
    | 'injection_flag'
    | 'release_at'
    | 'funded_at'
    | 'submitted_at'
    | 'decided_at'
    | 'paid_at'
  >
>;

export class MilestonesRepo {
  constructor(private readonly db: DB) {}

  async insert(row: MilestonesTable): Promise<void> {
    await this.db.insertInto('milestones').values(row).execute();
  }

  async getRow(id: string): Promise<MilestonesTable | null> {
    return (await this.db.selectFrom('milestones').selectAll().where('id', '=', id).executeTakeFirst()) ?? null;
  }

  async getDTO(id: string): Promise<MilestoneDTO | null> {
    const row = await this.db
      .selectFrom('milestones as m')
      .innerJoin('contracts as c', 'c.id', 'm.contract_id')
      .selectAll('m')
      .select('c.title as contract_title')
      .where('m.id', '=', id)
      .executeTakeFirst();
    return row ? toMilestoneDTO(row, row.contract_title) : null;
  }

  async listByContract(contractId: string): Promise<MilestoneDTO[]> {
    const rows = await this.db
      .selectFrom('milestones as m')
      .innerJoin('contracts as c', 'c.id', 'm.contract_id')
      .selectAll('m')
      .select('c.title as contract_title')
      .where('m.contract_id', '=', contractId)
      .orderBy('m.seq')
      .execute();
    return rows.map((r) => toMilestoneDTO(r, r.contract_title));
  }

  async listAll(filter: { buyerId?: string; contractorId?: string } = {}): Promise<MilestoneDTO[]> {
    let q = this.db
      .selectFrom('milestones as m')
      .innerJoin('contracts as c', 'c.id', 'm.contract_id')
      .selectAll('m')
      .select('c.title as contract_title');
    if (filter.buyerId) q = q.where('c.buyer_id', '=', filter.buyerId);
    if (filter.contractorId) q = q.where('c.contractor_id', '=', filter.contractorId);
    const rows = await q.orderBy('c.created_at', 'desc').orderBy('m.seq').execute();
    return rows.map((r) => toMilestoneDTO(r, r.contract_title));
  }

  /**
   * Compare-and-set status update. Returns false when the row is no longer in `from`
   * (another request won the race), which callers surface as a 409.
   */
  async casStatus(id: string, from: string, to: string, patch: MilestonePatch, updatedAt: string): Promise<boolean> {
    const res = await this.db
      .updateTable('milestones')
      .set({ ...patch, status: to, updated_at: updatedAt })
      .where('id', '=', id)
      .where('status', '=', from)
      .executeTakeFirst();
    return Number(res.numUpdatedRows) === 1;
  }

  async patch(id: string, patch: MilestonePatch, updatedAt: string): Promise<void> {
    await this.db
      .updateTable('milestones')
      .set({ ...patch, updated_at: updatedAt })
      .where('id', '=', id)
      .execute();
  }

  async nextPending(contractId: string): Promise<MilestonesTable | null> {
    return (
      (await this.db
        .selectFrom('milestones')
        .selectAll()
        .where('contract_id', '=', contractId)
        .where('status', '=', 'PENDING')
        .orderBy('seq')
        .executeTakeFirst()) ?? null
    );
  }

  async listByStatus(status: string): Promise<MilestonesTable[]> {
    return this.db.selectFrom('milestones').selectAll().where('status', '=', status).execute();
  }

  async dueForRelease(nowIso: string): Promise<MilestonesTable[]> {
    return this.db
      .selectFrom('milestones')
      .selectAll()
      .where('status', '=', 'APPROVED')
      .where('release_at', 'is not', null)
      .where('release_at', '<=', nowIso)
      .execute();
  }

  async countOpenForContract(contractId: string): Promise<number> {
    const rows = await this.db
      .selectFrom('milestones')
      .select('status')
      .where('contract_id', '=', contractId)
      .execute();
    return rows.filter((r) => !['PAID', 'REFUNDED', 'EXPIRED'].includes(r.status)).length;
  }
}
