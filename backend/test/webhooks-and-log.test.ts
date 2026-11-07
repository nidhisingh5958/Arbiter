import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { AppContext } from '../src/context';
import { MOCK_ALGO, signMockWebhook } from '../src/paypal/mock';
import { DEMO_USER_IDS } from '../src/repositories';
import { makeCtx, testConfig } from './helpers';

let ctx: AppContext | null = null;
afterEach(async () => {
  await ctx?.close();
  ctx = null;
});

function signed(secret: string, body: string) {
  const id = 'tx-1';
  const time = new Date().toISOString();
  return {
    'paypal-transmission-id': id,
    'paypal-transmission-time': time,
    'paypal-auth-algo': MOCK_ALGO,
    'paypal-cert-url': 'mock://cert',
    'paypal-transmission-sig': signMockWebhook(secret, id, time, body),
  };
}

describe('PayPal webhooks', () => {
  it('rejects unsigned or tampered events and records them as unverified', async () => {
    ctx = await makeCtx();
    const body = JSON.stringify({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-1' } });
    await expect(ctx.webhooks.handle(body, {})).rejects.toThrow(/signature/i);
    const headers = signed(ctx.config.appSecret, body);
    await expect(ctx.webhooks.handle(body.replace('CAP-1', 'CAP-2'), headers)).rejects.toThrow(/signature/i);
    const row = await ctx.repos.webhookEvents.get('WH-1');
    expect(row?.verified).toBe(0);
  });

  it('processes a signed event once and de-duplicates redeliveries', async () => {
    ctx = await makeCtx();
    const body = JSON.stringify({ id: 'WH-2', event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'X' } });
    const headers = signed(ctx.config.appSecret, body);
    expect((await ctx.webhooks.handle(body, headers)).status).toBe('processed');
    expect((await ctx.webhooks.handle(body, headers)).status).toBe('duplicate');
    const row = await ctx.repos.webhookEvents.get('WH-2');
    expect(row?.processed).toBe(1);
    expect(row?.duplicate_count).toBe(1);
  });
});

describe('decision log', () => {
  it('is hash-chained and append-only at the database level', async () => {
    ctx = await makeCtx();
    await ctx.decisionLog.append({ milestoneId: null, action: 'EXTRACTION', actor: 'test', inputs: { a: 1 }, outputs: { ok: true } });
    await ctx.decisionLog.append({ milestoneId: null, action: 'EXTRACTION', actor: 'test', inputs: { a: 2 }, outputs: { ok: true }, confidence: 0.93 });
    const chain = await ctx.decisionLog.verifyChain();
    expect(chain).toMatchObject({ valid: true, length: 2 });

    await expect(sql`UPDATE agent_decisions SET actor = 'evil'`.execute(ctx.db)).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM agent_decisions`.execute(ctx.db)).rejects.toThrow(/append-only/);
  });
});

describe('HTTP API', () => {
  it('serves health, enforces demo auth and roles', async () => {
    const app = await buildApp(testConfig());
    try {
      const health = await app.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ status: 'ok', modes: { paypal: 'mock', llm: 'mock' } });

      expect((await app.inject({ method: 'GET', url: '/api/contracts' })).statusCode).toBe(401);

      const asContractor = await app.inject({
        method: 'POST',
        url: '/api/contracts/extract',
        headers: { 'x-demo-user': DEMO_USER_IDS.contractor },
        payload: { sowText: 'x'.repeat(50) },
      });
      expect(asContractor.statusCode).toBe(403);

      const bad = await app.inject({
        method: 'POST',
        url: '/api/contracts',
        headers: { 'x-demo-user': DEMO_USER_IDS.buyer },
        payload: { draft: { title: 'x' } },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.message).toMatch(/Invalid contract/);

      const tools = await app.inject({ method: 'GET', url: '/api/agent/tools', headers: { 'x-demo-user': DEMO_USER_IDS.admin } });
      expect(tools.json().map((t: { name: string }) => t.name)).toContain('create_payout');

      const webhook = await app.inject({
        method: 'POST',
        url: '/api/webhooks/paypal',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ id: 'WH-9', event_type: 'X', resource: {} }),
      });
      expect(webhook.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
