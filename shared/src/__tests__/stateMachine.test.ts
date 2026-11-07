import { describe, expect, it } from 'vitest';
import {
  MILESTONE_STATUSES,
  MILESTONE_TRANSITIONS,
  IllegalTransitionError,
  assertTransition,
  canTransition,
  isTerminal,
  type MilestoneStatus,
} from '../index';

describe('milestone state machine', () => {
  it('defines transitions for every status', () => {
    for (const s of MILESTONE_STATUSES) expect(MILESTONE_TRANSITIONS[s]).toBeDefined();
  });

  it('allows the happy path', () => {
    const path: MilestoneStatus[] = ['PENDING', 'FUNDING_REQUIRED', 'FUNDED', 'SUBMITTED', 'VERIFYING', 'APPROVED', 'PAID'];
    for (let i = 0; i < path.length - 1; i++) expect(() => assertTransition(path[i]!, path[i + 1]!)).not.toThrow();
  });

  it('rejects every transition not explicitly listed', () => {
    let rejected = 0;
    for (const from of MILESTONE_STATUSES) {
      for (const to of MILESTONE_STATUSES) {
        const allowed = MILESTONE_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(allowed);
        if (!allowed) {
          expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
          rejected++;
        }
      }
    }
    expect(rejected).toBeGreaterThan(100);
  });

  it('never lets money skip verification', () => {
    expect(canTransition('FUNDED', 'APPROVED')).toBe(false);
    expect(canTransition('SUBMITTED', 'PAID')).toBe(false);
    expect(canTransition('FUNDED', 'PAID')).toBe(false);
    expect(canTransition('DISPUTED', 'PAID')).toBe(false);
    expect(canTransition('ESCALATED', 'PAID')).toBe(false);
  });

  it('treats PAID, EXPIRED and REFUNDED as terminal', () => {
    expect(isTerminal('PAID')).toBe(true);
    expect(isTerminal('EXPIRED')).toBe(true);
    expect(isTerminal('REFUNDED')).toBe(true);
    for (const t of ['PAID', 'EXPIRED', 'REFUNDED'] as const) expect(MILESTONE_TRANSITIONS[t]).toHaveLength(0);
  });
});
