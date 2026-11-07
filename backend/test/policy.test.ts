import { describe, expect, it } from 'vitest';
import { evaluatePolicy, type PolicyContext } from '../src/agent/policy/engine';

const policy = {
  maxAutoReleaseCents: 150_000,
  minConfidence: 0.85,
  dailyPayoutCapCents: 500_000,
  humanApprovalAboveCents: 200_000,
  disputeWindowSeconds: 30,
};

const base: PolicyContext = {
  amountCents: 90_000,
  currency: 'USD',
  verdict: 'APPROVE',
  confidence: 0.93,
  deterministicPass: true,
  checksErrored: false,
  injectionSuspected: false,
  paidTodayCents: 0,
  disputed: false,
};

describe('policy engine', () => {
  it('auto-releases when every rule passes', () => {
    const r = evaluatePolicy(policy, base);
    expect(r.outcome).toBe('AUTO_RELEASE');
    expect(r.reasons.every((x) => x.passed)).toBe(true);
  });

  it('never approves when deterministic checks fail, even if the LLM says APPROVE', () => {
    expect(evaluatePolicy(policy, { ...base, deterministicPass: false }).outcome).toBe('REJECT');
    expect(evaluatePolicy(policy, { ...base, deterministicPass: false, checksErrored: true }).outcome).toBe('ESCALATE');
  });

  it('escalates prompt-injection regardless of verdict and confidence', () => {
    expect(evaluatePolicy(policy, { ...base, injectionSuspected: true, confidence: 1 }).outcome).toBe('ESCALATE');
  });

  it('escalates low confidence', () => {
    expect(evaluatePolicy(policy, { ...base, confidence: 0.6 }).outcome).toBe('ESCALATE');
  });

  it('escalates amounts above the auto-release limit or human-approval threshold', () => {
    expect(evaluatePolicy(policy, { ...base, amountCents: 160_000 }).outcome).toBe('ESCALATE');
    expect(evaluatePolicy({ ...policy, maxAutoReleaseCents: 900_000 }, { ...base, amountCents: 250_000 }).outcome).toBe('ESCALATE');
  });

  it('enforces the daily payout cap', () => {
    const r = evaluatePolicy(policy, { ...base, paidTodayCents: 450_000 });
    expect(r.outcome).toBe('ESCALATE');
    expect(r.reasons.find((x) => x.rule === 'daily_payout_cap')?.passed).toBe(false);
  });

  it('pauses on open disputes and passes LLM rejections through', () => {
    expect(evaluatePolicy(policy, { ...base, disputed: true }).outcome).toBe('ESCALATE');
    expect(evaluatePolicy(policy, { ...base, verdict: 'REJECT' }).outcome).toBe('REJECT');
  });
});
