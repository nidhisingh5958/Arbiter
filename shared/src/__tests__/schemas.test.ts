import { describe, expect, it } from 'vitest';
import { ContractDraftSchema, JudgeOutputSchema, computeAllowedActions, defaultVerification } from '../index';

const milestone = (amountCents: number) => ({
  title: 'Checkout page',
  description: '',
  acceptanceCriteria: ['PR merged'],
  amountCents,
  currency: 'USD',
  deadline: '2030-01-01',
  verification: defaultVerification('URL'),
});

describe('ContractDraftSchema', () => {
  it('accepts milestones that sum to the total', () => {
    const r = ContractDraftSchema.safeParse({
      title: 'Store',
      currency: 'USD',
      totalCents: 1000,
      milestones: [milestone(400), milestone(600)],
    });
    expect(r.success).toBe(true);
  });

  it('rejects milestones that do not sum to the total', () => {
    const r = ContractDraftSchema.safeParse({
      title: 'Store',
      currency: 'USD',
      totalCents: 1000,
      milestones: [milestone(400), milestone(500)],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message.includes('sum to'))).toBe(true);
  });

  it('rejects malformed deadlines and non-positive amounts', () => {
    const bad = { ...milestone(0), deadline: '01/02/2030' };
    const r = ContractDraftSchema.safeParse({ title: 'Store', currency: 'USD', totalCents: 0, milestones: [bad] });
    expect(r.success).toBe(false);
  });
});

describe('JudgeOutputSchema', () => {
  it('rejects confidence outside 0..1 and unknown verdicts', () => {
    expect(
      JudgeOutputSchema.safeParse({ verdict: 'APPROVE', confidence: 1.4, summary: 'x', criteria: [] }).success,
    ).toBe(false);
    expect(
      JudgeOutputSchema.safeParse({
        verdict: 'PAY_NOW',
        confidence: 0.9,
        summary: 'x',
        criteria: [{ criterion: 'a', status: 'MET', evidence: 'e', confidence: 0.9 }],
      }).success,
    ).toBe(false);
  });
});

describe('computeAllowedActions', () => {
  const base = { isBuyer: false, isContractor: false, hasPayout: false } as const;
  it('lets only the buyer fund', () => {
    expect(computeAllowedActions({ ...base, status: 'FUNDING_REQUIRED', role: 'buyer', isBuyer: true })).toContain('FUND');
    expect(computeAllowedActions({ ...base, status: 'FUNDING_REQUIRED', role: 'contractor', isContractor: true })).not.toContain('FUND');
  });
  it('only admins resolve disputes', () => {
    expect(computeAllowedActions({ ...base, status: 'DISPUTED', role: 'buyer', isBuyer: true })).not.toContain('RESOLVE_APPROVE');
    expect(computeAllowedActions({ ...base, status: 'DISPUTED', role: 'admin' })).toContain('RESOLVE_APPROVE');
  });
  it('blocks buyer disputes once a payout started', () => {
    expect(computeAllowedActions({ ...base, status: 'APPROVED', role: 'buyer', isBuyer: true, hasPayout: true })).not.toContain(
      'DISPUTE',
    );
  });
});
