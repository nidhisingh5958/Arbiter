import type { ContractDTO, ContractStatus, MilestoneStatus } from '@arbiter/shared';
import { isEscrowed } from '@arbiter/shared';
import type { ContractsTable, DB } from '../db/types';
import { nowIso } from '../lib/time';

export class ContractsRepo {
  constructor(private readonly db: DB) {}

  async insert(row: ContractsTable): Promise<void> {
    await this.db.insertInto('contracts').values(row).execute();
  }

  async getRow(id: string): Promise<ContractsTable | null> {
    return (await this.db.selectFrom('contracts').selectAll().where('id', '=', id).executeTakeFirst()) ?? null;
  }

  async setStatus(id: string, status: ContractStatus): Promise<void> {
    await this.db.updateTable('contracts').set({ status, updated_at: nowIso() }).where('id', '=', id).execute();
  }

  async touch(id: string): Promise<void> {
    await this.db.updateTable('contracts').set({ updated_at: nowIso() }).where('id', '=', id).execute();
  }

  /** Lists contracts visible to a user with per-contract aggregates. */
  async listDTOs(filter: { buyerId?: string; contractorId?: string; ids?: string[] } = {}): Promise<ContractDTO[]> {
    let q = this.db
      .selectFrom('contracts as c')
      .innerJoin('users as b', 'b.id', 'c.buyer_id')
      .innerJoin('users as k', 'k.id', 'c.contractor_id')
      .selectAll('c')
      .select(['b.name as buyer_name', 'k.name as contractor_name']);
    if (filter.buyerId) q = q.where('c.buyer_id', '=', filter.buyerId);
    if (filter.contractorId) q = q.where('c.contractor_id', '=', filter.contractorId);
    if (filter.ids) {
      if (filter.ids.length === 0) return [];
      q = q.where('c.id', 'in', filter.ids);
    }
    const rows = await q.orderBy('c.created_at', 'desc').execute();
    if (rows.length === 0) return [];

    const milestones = await this.db
      .selectFrom('milestones')
      .select(['contract_id', 'status', 'amount_cents', 'seq'])
      .where(
        'contract_id',
        'in',
        rows.map((r) => r.id),
      )
      .orderBy('seq')
      .execute();

    return rows.map((r) => {
      const ms = milestones.filter((m) => m.contract_id === r.id);
      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        status: r.status as ContractStatus,
        currency: r.currency,
        totalCents: r.total_cents,
        buyerId: r.buyer_id,
        contractorId: r.contractor_id,
        buyerName: r.buyer_name,
        contractorName: r.contractor_name,
        milestoneCount: ms.length,
        paidCents: ms.filter((m) => m.status === 'PAID').reduce((s, m) => s + m.amount_cents, 0),
        escrowedCents: ms
          .filter((m) => isEscrowed(m.status as MilestoneStatus))
          .reduce((s, m) => s + m.amount_cents, 0),
        milestoneStatuses: ms.map((m) => m.status as MilestoneStatus),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  }

  async getDTO(id: string): Promise<ContractDTO | null> {
    const [one] = await this.listDTOs({ ids: [id] });
    return one ?? null;
  }
}
