import type { AgentDecisionDTO, ChainVerificationDTO, DecisionAction, Verdict } from '@arbiter/shared';
import type { AgentDecisionsTable, DB } from '../db/types';
import { canonicalJson, hashObject, newId, sha256Hex } from '../lib/crypto';
import { KeyedMutex } from '../lib/mutex';
import { nowIso } from '../lib/time';
import type { EventBus } from '../realtime/eventBus';
import { toDecisionDTO } from '../repositories/mappers';

export const GENESIS_HASH = '0'.repeat(64);
const MAX_OUTPUT_CHARS = 24_000;

export interface DecisionInput {
  milestoneId: string | null;
  submissionId?: string | null;
  action: DecisionAction;
  actor: string;
  verdict?: Verdict | null;
  confidence?: number | null;
  /** Hashed (not stored) so the record proves which inputs were used without duplicating them. */
  inputs: unknown;
  outputs: unknown;
  model?: string | null;
  usage?: { promptTokens: number; completionTokens: number } | null;
  latencyMs?: number | null;
}

type HashedFields = Omit<AgentDecisionsTable, 'id' | 'hash'>;

function hashRecord(fields: HashedFields): string {
  return sha256Hex(fields.prev_hash + canonicalJson(fields));
}

/**
 * Append-only, hash-chained log of every agent action. The table also has DB triggers
 * that abort UPDATE/DELETE, and `verifyChain` detects any out-of-band tampering.
 */
export class DecisionLog {
  private readonly lock = new KeyedMutex();

  constructor(
    private readonly db: DB,
    private readonly bus: EventBus,
  ) {}

  async append(input: DecisionInput): Promise<AgentDecisionDTO> {
    return this.lock.run('decision-chain', async () => {
      const last = await this.db
        .selectFrom('agent_decisions')
        .select(['seq', 'hash'])
        .orderBy('seq', 'desc')
        .limit(1)
        .executeTakeFirst();

      let outputs = canonicalJson(input.outputs ?? null);
      if (outputs.length > MAX_OUTPUT_CHARS) {
        outputs = canonicalJson({ truncated: true, preview: outputs.slice(0, MAX_OUTPUT_CHARS) });
      }

      const fields: HashedFields = {
        seq: (last?.seq ?? 0) + 1,
        milestone_id: input.milestoneId,
        submission_id: input.submissionId ?? null,
        action: input.action,
        actor: input.actor,
        verdict: input.verdict ?? null,
        confidence: input.confidence === undefined || input.confidence === null ? null : round4(input.confidence),
        inputs_hash: hashObject(input.inputs ?? null),
        outputs,
        model: input.model ?? null,
        prompt_tokens: input.usage?.promptTokens ?? null,
        completion_tokens: input.usage?.completionTokens ?? null,
        latency_ms: input.latencyMs === undefined || input.latencyMs === null ? null : Math.round(input.latencyMs),
        prev_hash: last?.hash ?? GENESIS_HASH,
        created_at: nowIso(),
      };
      const row: AgentDecisionsTable = { id: newId('dec'), ...fields, hash: hashRecord(fields) };
      await this.db.insertInto('agent_decisions').values(row).execute();

      this.bus.publish({
        type: 'decision.created',
        milestoneId: row.milestone_id,
        action: input.action,
        verdict: row.verdict as Verdict | null,
        seq: row.seq,
      });
      return toDecisionDTO(row);
    });
  }

  async verifyChain(): Promise<ChainVerificationDTO> {
    const rows = await this.db.selectFrom('agent_decisions').selectAll().orderBy('seq').execute();
    let prev = GENESIS_HASH;
    for (const r of rows) {
      const { id: _id, hash, ...fields } = r;
      if (r.prev_hash !== prev || hashRecord(fields) !== hash) {
        return { valid: false, length: rows.length, brokenAtSeq: r.seq, headHash: rows.at(-1)?.hash ?? null };
      }
      prev = hash;
    }
    return { valid: true, length: rows.length, brokenAtSeq: null, headHash: rows.at(-1)?.hash ?? null };
  }

  async listByMilestone(milestoneId: string): Promise<AgentDecisionDTO[]> {
    const rows = await this.db
      .selectFrom('agent_decisions')
      .selectAll()
      .where('milestone_id', '=', milestoneId)
      .orderBy('seq')
      .execute();
    return rows.map((r) => toDecisionDTO(r));
  }

  async listRecent(limit = 500): Promise<AgentDecisionDTO[]> {
    const rows = await this.db
      .selectFrom('agent_decisions as d')
      .leftJoin('milestones as m', 'm.id', 'd.milestone_id')
      .selectAll('d')
      .select('m.title as milestone_title')
      .orderBy('d.seq', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => toDecisionDTO(r, r.milestone_title ?? null));
  }

  /** Latest decision of a given action for a milestone (e.g. the LLM verdict for the review screen). */
  async latest(milestoneId: string, action: DecisionAction): Promise<AgentDecisionDTO | null> {
    const row = await this.db
      .selectFrom('agent_decisions')
      .selectAll()
      .where('milestone_id', '=', milestoneId)
      .where('action', '=', action)
      .orderBy('seq', 'desc')
      .executeTakeFirst();
    return row ? toDecisionDTO(row) : null;
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
