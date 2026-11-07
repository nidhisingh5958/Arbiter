import type { InspectionDTO } from '@arbiter/shared';
import type { DB, InspectionsTable } from '../db/types';
import { toInspectionDTO } from './mappers';

export class InspectionsRepo {
  constructor(private readonly db: DB) {}

  async insertMany(rows: InspectionsTable[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insertInto('inspections').values(rows).execute();
  }

  async listBySubmission(submissionId: string): Promise<InspectionsTable[]> {
    return this.db
      .selectFrom('inspections')
      .selectAll()
      .where('submission_id', '=', submissionId)
      .orderBy('created_at')
      .execute();
  }

  async listByMilestone(milestoneId: string): Promise<InspectionDTO[]> {
    const rows = await this.db
      .selectFrom('inspections as i')
      .innerJoin('milestones as m', 'm.id', 'i.milestone_id')
      .innerJoin('contracts as c', 'c.id', 'm.contract_id')
      .selectAll('i')
      .select(['m.title as milestone_title', 'c.title as contract_title'])
      .where('i.milestone_id', '=', milestoneId)
      .orderBy('i.created_at', 'desc')
      .execute();
    return rows.map((r) => toInspectionDTO(r, r.milestone_title, r.contract_title));
  }

  async listRecent(limit = 500): Promise<InspectionDTO[]> {
    const rows = await this.db
      .selectFrom('inspections as i')
      .innerJoin('milestones as m', 'm.id', 'i.milestone_id')
      .innerJoin('contracts as c', 'c.id', 'm.contract_id')
      .selectAll('i')
      .select(['m.title as milestone_title', 'c.title as contract_title'])
      .orderBy('i.created_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => toInspectionDTO(r, r.milestone_title, r.contract_title));
  }

  async countInjectionFlags(): Promise<number> {
    const rows = await this.db
      .selectFrom('inspections')
      .select('milestone_id')
      .where('injection_flag', '=', 1)
      .execute();
    return new Set(rows.map((r) => r.milestone_id)).size;
  }
}
