import { DEMO_PRS, DEMO_URLS, UpdateMeSchema, type PublicConfigDTO } from '@arbiter/shared';
import type { FastifyPluginAsync } from 'fastify';
import { pingDb } from '../../db/client';
import { parseOrThrow } from '../../lib/validate';
import { requireUser } from '../types';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get('/health', async (_req, reply) => {
    const dbOk = await pingDb(ctx.db);
    return reply.status(dbOk ? 200 : 503).send({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'up' : 'down',
      dialect: ctx.dialect,
      version: ctx.config.version,
      uptimeSeconds: Math.round(process.uptime()),
      modes: { paypal: ctx.paypal.mode, llm: ctx.llm.mode, github: ctx.config.github.mode, escrow: ctx.config.escrowMode },
      sseClients: ctx.bus.listenerCount(),
    });
  });

  app.get('/config', async (): Promise<PublicConfigDTO> => ({
    version: ctx.config.version,
    paypalMode: ctx.paypal.mode,
    llmMode: ctx.llm.mode,
    llmModel: ctx.llm.model,
    githubMode: ctx.config.github.mode,
    escrowMode: ctx.config.escrowMode,
    defaultPolicy: ctx.config.policyDefaults,
    demoFixtures: {
      githubPrs: [
        { label: 'Happy path PR #42', url: DEMO_PRS.happy, expectation: 'Merged, green CI, correct paths → APPROVE' },
        { label: 'Failing PR #43', url: DEMO_PRS.failing, expectation: 'Red test job, not merged → REJECT' },
        { label: 'Injection PR #44', url: DEMO_PRS.injection, expectation: 'Tries to instruct the AI → ESCALATE' },
      ],
      urls: [
        { label: 'Launch page', url: DEMO_URLS.happy, expectation: 'All content present → APPROVE' },
        { label: 'Incomplete page', url: DEMO_URLS.incomplete, expectation: 'Missing form and copy → REJECT' },
        { label: 'Hidden injection', url: DEMO_URLS.injection, expectation: 'Hidden AI instructions → ESCALATE' },
        { label: 'Broken deploy', url: DEMO_URLS.broken, expectation: 'HTTP 503 → REJECT' },
      ],
    },
  }));

  app.get('/users', async () => ctx.repos.users.list());

  app.get('/users/me', async (req) => requireUser(req));

  app.patch('/users/me', async (req) => {
    const user = requireUser(req);
    const body = parseOrThrow(UpdateMeSchema, req.body, 'profile');
    await ctx.repos.users.updatePaypalEmail(user.id, body.paypalEmail);
    await ctx.repos.audit.append({
      actorId: user.id,
      actorRole: user.role,
      action: 'user.paypal_email_updated',
      entityType: 'user',
      entityId: user.id,
    });
    return ctx.repos.users.get(user.id);
  });
};
