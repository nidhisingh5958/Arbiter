import { DEMO_PRS } from '@arbiter/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../src/context';
import { MockPayPal } from '../src/paypal/mock';
import { demoContracts } from '../src/services/demo';
import { makeCtx, users, waitFor } from './helpers';

let ctx: AppContext | null = null;
afterEach(async () => {
  await ctx?.close();
  ctx = null;
});

async function fundedMilestone(c: AppContext, storyIndex: number) {
  const { buyer } = await users(c);
  const spec = demoContracts()[storyIndex]!;
  const contract = await c.contracts.create(buyer, { draft: spec.draft, contractorId: spec.contractorId, sowText: spec.sowText });
  const milestoneId = contract.milestones[0]!.id;
  expect(contract.milestones[0]!.status).toBe('FUNDING_REQUIRED');

  const start = await c.funding.start(buyer, milestoneId);
  expect(start.approveUrl).toContain('/mock-paypal/checkout');
  (c.paypal as MockPayPal).approveOrder(start.orderId);
  const funded = await c.funding.complete(`user:${buyer.id}`, milestoneId, start.orderId, buyer);
  expect(funded.status).toBe('FUNDED');
  return { contract, milestoneId };
}

describe('end-to-end escrow flow (mock PayPal + mock LLM)', () => {
  it('happy path: fund → submit PR → agent approves → payout → PAID → next milestone opens', async () => {
    ctx = await makeCtx();
    const { contractor } = await users(ctx);
    const { contract, milestoneId } = await fundedMilestone(ctx, 0);

    await ctx.submissions.submit(contractor, milestoneId, { kind: 'GITHUB_PR', url: DEMO_PRS.happy }, { waitForVerification: true });
    const paid = await waitFor(async () => {
      const m = await ctx!.repos.milestones.getRow(milestoneId);
      return m?.status === 'PAID' ? m : null;
    });
    expect(paid.decision_verdict).toBe('APPROVE');

    const payout = await ctx.repos.payments.latestOfKind(milestoneId, 'PAYOUT');
    expect(payout?.payout_batch_id).toMatch(/^MOCKBATCH/);
    expect(payout?.status).toBe('SUCCESS');

    const next = await ctx.repos.milestones.getRow(contract.milestones[1]!.id);
    expect(next?.status).toBe('FUNDING_REQUIRED');

    const chain = await ctx.decisionLog.verifyChain();
    expect(chain.valid).toBe(true);
    const actions = (await ctx.decisionLog.listByMilestone(milestoneId)).map((d) => d.action);
    expect(actions).toEqual(expect.arrayContaining(['DETERMINISTIC_CHECKS', 'INJECTION_SCAN', 'LLM_VERDICT', 'POLICY_GATE', 'FINAL_DECISION', 'TOOL_CALL']));
  });

  it('failing submission is rejected and no payout is attempted', async () => {
    ctx = await makeCtx();
    const { contractor2 } = await users(ctx);
    const { milestoneId } = await fundedMilestone(ctx, 1);
    await ctx.submissions.submit(contractor2, milestoneId, { kind: 'GITHUB_PR', url: DEMO_PRS.failing }, { waitForVerification: true });
    const m = await ctx.repos.milestones.getRow(milestoneId);
    expect(m?.status).toBe('REJECTED');
    expect(await ctx.repos.payments.latestOfKind(milestoneId, 'PAYOUT')).toBeNull();
  });

  it('prompt-injection submission is escalated with the flag set, and payout is blocked', async () => {
    ctx = await makeCtx();
    const { contractor } = await users(ctx);
    const { milestoneId } = await fundedMilestone(ctx, 2);
    await ctx.submissions.submit(contractor, milestoneId, { kind: 'GITHUB_PR', url: DEMO_PRS.injection }, { waitForVerification: true });
    const m = await ctx.repos.milestones.getRow(milestoneId);
    expect(m?.status).toBe('ESCALATED');
    expect(m?.injection_flag).toBe(1);
    const inspections = await ctx.repos.inspections.listByMilestone(milestoneId);
    expect(inspections.some((i) => i.injectionFlag)).toBe(true);
    expect(await ctx.repos.payments.latestOfKind(milestoneId, 'PAYOUT')).toBeNull();
  });

  it('create_payout is denied without a policy release grant', async () => {
    ctx = await makeCtx();
    const { milestoneId } = await fundedMilestone(ctx, 0);
    const res = await ctx.gateway.execute('create_payout', { milestone_id: milestoneId }, { actor: 'agent:payments' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.denied).toBe(true);
  });

  it('a buyer dispute pauses the payout and an admin can release it', async () => {
    ctx = await makeCtx({ POLICY_DISPUTE_WINDOW_SECONDS: '600' });
    const { buyer, contractor, admin } = await users(ctx);
    const { milestoneId } = await fundedMilestone(ctx, 0);
    await ctx.submissions.submit(contractor, milestoneId, { kind: 'GITHUB_PR', url: DEMO_PRS.happy }, { waitForVerification: true });
    expect((await ctx.repos.milestones.getRow(milestoneId))?.status).toBe('APPROVED');

    await ctx.disputes.raise(buyer, milestoneId, 'The checkout page breaks on mobile Safari.');
    expect((await ctx.repos.milestones.getRow(milestoneId))?.status).toBe('DISPUTED');
    await ctx.payouts.releaseDue();
    expect(await ctx.repos.payments.latestOfKind(milestoneId, 'PAYOUT')).toBeNull();

    await expect(ctx.disputes.resolve(buyer, milestoneId, 'APPROVE', 'ok')).rejects.toThrow(/admin/i);
    await ctx.disputes.resolve(admin, milestoneId, 'APPROVE', 'Verified on Safari; works as specified.');
    await waitFor(async () => (await ctx!.repos.milestones.getRow(milestoneId))?.status === 'PAID');
  });

  it('a buyer can refund a rejected milestone and the next one opens', async () => {
    ctx = await makeCtx();
    const { buyer, contractor2 } = await users(ctx);
    const { milestoneId } = await fundedMilestone(ctx, 1);
    await ctx.submissions.submit(contractor2, milestoneId, { kind: 'GITHUB_PR', url: DEMO_PRS.failing }, { waitForVerification: true });
    await ctx.disputes.refund(buyer, milestoneId, 'Contractor could not deliver');
    expect((await ctx.repos.milestones.getRow(milestoneId))?.status).toBe('REFUNDED');
    expect((await ctx.repos.payments.latestOfKind(milestoneId, 'REFUND'))?.refund_id).toMatch(/^MOCKREF/);
  });
});
