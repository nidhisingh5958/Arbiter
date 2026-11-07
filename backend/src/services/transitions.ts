import { assertTransition, type MilestoneStatus } from '@arbiter/shared';
import type { MilestonesTable } from '../db/types';
import { conflict, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import type { EventBus } from '../realtime/eventBus';
import type { Repositories } from '../repositories';
import type { MilestonePatch } from '../repositories/milestones';

export interface TransitionOptions {
  patch?: MilestonePatch;
  actorId?: string | null;
  actorRole?: string | null;
  reason?: string;
}

/**
 * The only code path that changes a milestone's status. Enforces the shared state machine,
 * uses compare-and-set to avoid lost updates, audits the change and broadcasts it over SSE.
 */
export class MilestoneTransitions {
  constructor(
    private readonly repos: Repositories,
    private readonly bus: EventBus,
  ) {}

  async transition(milestoneId: string, to: MilestoneStatus, opts: TransitionOptions = {}): Promise<MilestonesTable> {
    const row = await this.repos.milestones.getRow(milestoneId);
    if (!row) throw notFound('Milestone');
    const from = row.status as MilestoneStatus;
    assertTransition(from, to);

    const updatedAt = nowIso();
    const ok = await this.repos.milestones.casStatus(milestoneId, from, to, opts.patch ?? {}, updatedAt);
    if (!ok) throw conflict(`Milestone changed while processing (expected ${from}); refresh and try again`);

    await this.repos.audit.append({
      actorId: opts.actorId ?? null,
      actorRole: opts.actorRole ?? (opts.actorId ? null : 'system'),
      action: `milestone.transition`,
      entityType: 'milestone',
      entityId: milestoneId,
      details: { from, to, reason: opts.reason ?? null },
    });
    await this.repos.contracts.touch(row.contract_id);
    this.bus.publish({ type: 'milestone.updated', milestoneId, contractId: row.contract_id, status: to, title: row.title });
    return { ...row, ...(opts.patch ?? {}), status: to, updated_at: updatedAt };
  }

  /** After a milestone settles (paid/refunded), open the next one for funding or complete the contract. */
  async activateNext(contractId: string): Promise<void> {
    const next = await this.repos.milestones.nextPending(contractId);
    if (next) {
      await this.transition(next.id, 'FUNDING_REQUIRED', { reason: 'Previous milestone settled' });
      return;
    }
    if ((await this.repos.milestones.countOpenForContract(contractId)) === 0) {
      await this.repos.contracts.setStatus(contractId, 'COMPLETED');
      this.bus.publish({ type: 'contract.updated', contractId });
    }
  }
}
