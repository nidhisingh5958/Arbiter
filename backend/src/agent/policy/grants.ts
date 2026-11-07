import type { DB } from '../../db/types';
import { hmacHex, newId, safeEqualHex } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { addSecondsIso, nowIso } from '../../lib/time';

export type GrantKind = 'AUTO' | 'HUMAN';

export interface ReleaseGrant {
  id: string;
  token: string;
  milestoneId: string;
  amountCents: number;
  kind: GrantKind;
  expiresAt: string;
}

export class PolicyDeniedError extends AppError {
  constructor(message: string) {
    super(403, 'POLICY_DENIED', message);
    this.name = 'PolicyDeniedError';
  }
}

/**
 * Single-use, HMAC-signed release grants. Only the policy engine issues them; the
 * create_payout tool refuses to run without one bound to the exact milestone and amount.
 * The token never enters an LLM prompt — the gateway injects it server-side.
 */
export class ReleaseGrants {
  constructor(
    private readonly db: DB,
    private readonly secret: string,
  ) {}

  private sign(id: string, milestoneId: string, amountCents: number, expiresAt: string): string {
    return hmacHex(this.secret, `grant|${id}|${milestoneId}|${amountCents}|${expiresAt}`);
  }

  async issue(milestoneId: string, amountCents: number, kind: GrantKind, issuedBy: string, ttlSeconds = 120): Promise<ReleaseGrant> {
    const id = newId('grt');
    const created = nowIso();
    const expiresAt = addSecondsIso(created, ttlSeconds);
    await this.db
      .insertInto('release_grants')
      .values({ id, milestone_id: milestoneId, amount_cents: amountCents, kind, issued_by: issuedBy, expires_at: expiresAt, used_at: null, created_at: created })
      .execute();
    return { id, token: `${id}.${this.sign(id, milestoneId, amountCents, expiresAt)}`, milestoneId, amountCents, kind, expiresAt };
  }

  /** Verifies signature, binding, expiry and single use, then atomically marks the grant used. */
  async consume(token: string | undefined, milestoneId: string, amountCents: number): Promise<{ id: string; kind: GrantKind }> {
    if (!token) throw new PolicyDeniedError('No release grant from the policy engine');
    const [id, sig] = token.split('.');
    if (!id || !sig) throw new PolicyDeniedError('Malformed release grant');
    const row = await this.db.selectFrom('release_grants').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw new PolicyDeniedError('Unknown release grant');
    if (!safeEqualHex(sig, this.sign(row.id, row.milestone_id, row.amount_cents, row.expires_at))) {
      throw new PolicyDeniedError('Release grant signature is invalid');
    }
    if (row.milestone_id !== milestoneId || row.amount_cents !== amountCents) {
      throw new PolicyDeniedError('Release grant does not match this milestone and amount');
    }
    if (row.expires_at < nowIso()) throw new PolicyDeniedError('Release grant has expired');
    const res = await this.db
      .updateTable('release_grants')
      .set({ used_at: nowIso() })
      .where('id', '=', id)
      .where('used_at', 'is', null)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) !== 1) throw new PolicyDeniedError('Release grant was already used');
    return { id: row.id, kind: row.kind as GrantKind };
  }
}
