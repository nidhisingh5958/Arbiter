import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/errors';
import { parseOrThrow } from '../../lib/validate';
import { MockPayPal } from '../../paypal/mock';
import { requireUser, type IdParams } from '../types';

const ScenarioSchema = z.object({ autoRun: z.boolean().default(true) });

export const demoRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.post('/demo/scenario', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = requireUser(req);
    const { autoRun } = parseOrThrow(ScenarioSchema, req.body ?? {}, 'demo request');
    return reply.status(202).send(await ctx.demo.runScenario(user, autoRun));
  });

  // Simulated PayPal checkout (PAYPAL_MODE=mock only).
  const mock = () => {
    if (!(ctx.paypal instanceof MockPayPal)) throw new AppError(404, 'NOT_FOUND', 'Mock checkout is only available when PAYPAL_MODE=mock');
    return ctx.paypal;
  };

  app.get<{ Params: IdParams }>('/mock-paypal/orders/:id', async (req) => {
    const order = mock().getMockOrder(req.params.id);
    if (!order) throw notFound('Mock order (the simulator resets when the server restarts)');
    return {
      id: order.id,
      status: order.status,
      amountCents: order.amountCents,
      currency: order.currency,
      description: order.description,
      returnUrl: order.returnUrl,
      cancelUrl: order.cancelUrl,
    };
  });

  app.post<{ Params: IdParams }>('/mock-paypal/orders/:id/approve', async (req) => {
    requireUser(req);
    const order = mock().approveOrder(req.params.id);
    return { id: order.id, status: order.status, returnUrl: order.returnUrl };
  });
};
