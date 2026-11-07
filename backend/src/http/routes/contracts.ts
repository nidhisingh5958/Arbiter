import { CreateContractSchema, ExtractRequestSchema, PolicyInputSchema } from '@arbiter/shared';
import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/validate';
import { requireUser, type IdParams } from '../types';

export const contractRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.post('/contracts/extract', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parseOrThrow(ExtractRequestSchema, req.body, 'statement of work');
    return ctx.contracts.extract(user, body);
  });

  app.post('/contracts', async (req, reply) => {
    const user = requireUser(req);
    const body = parseOrThrow(CreateContractSchema, req.body, 'contract');
    const created = await ctx.contracts.create(user, body);
    return reply.status(201).send(created);
  });

  app.get('/contracts', async (req) => ctx.contracts.list(requireUser(req)));

  app.get<{ Params: IdParams }>('/contracts/:id', async (req) => ctx.contracts.getDetail(requireUser(req), req.params.id));

  app.put<{ Params: IdParams }>('/contracts/:id/policy', async (req) => {
    const user = requireUser(req);
    const policy = parseOrThrow(PolicyInputSchema, req.body, 'policy');
    return ctx.contracts.updatePolicy(user, req.params.id, policy);
  });
};
