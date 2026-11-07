import type { SubmissionDTO } from '@arbiter/shared';
import type { DB, SubmissionsTable } from '../db/types';
import { toSubmissionDTO } from './mappers';

export class SubmissionsRepo {
  constructor(private readonly db: DB) {}

  async insert(row: SubmissionsTable): Promise<void> {
    await this.db.insertInto('submissions').values(row).execute();
  }

  async getRow(id: string): Promise<SubmissionsTable | null> {
    return (await this.db.selectFrom('submissions').selectAll().where('id', '=', id).executeTakeFirst()) ?? null;
  }

  async latestRow(milestoneId: string): Promise<SubmissionsTable | null> {
    return (
      (await this.db
        .selectFrom('submissions')
        .selectAll()
        .where('milestone_id', '=', milestoneId)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst()) ?? null
    );
  }

  async listByMilestone(milestoneId: string): Promise<SubmissionDTO[]> {
    const rows = await this.db
      .selectFrom('submissions')
      .selectAll()
      .where('milestone_id', '=', milestoneId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toSubmissionDTO);
  }
}
