import {
  CaptureFundingSchema,
  DisputeInputSchema,
  RefundInputSchema,
  ResolveInputSchema,
  SubmissionInputSchema,
} from '@arbiter/shared';
import type { FastifyPluginAsync } from 'fastify';
import { notFound } from '../../lib/errors';
import { parseOrThrow } from '../../lib/validate';
import { actorOf } from '../../services/access';
import { requireUser, type IdParams } from '../types';

export const milestoneRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get<{ Params: IdParams }>('/milestones/:id', async (req) => ctx.insights.review(requireUser(req), req.params.id));

  // Funding (PayPal Orders v2)
  app.post<{ Params: IdParams }>('/milestones/:id/funding', async (req) => ctx.funding.start(requireUser(req), req.params.id));

  app.post<{ Params: IdParams }>('/milestones/:id/funding/capture', async (req) => {
    const user = requireUser(req);
    const { orderId } = parseOrThrow(CaptureFundingSchema, req.body, 'capture request');
    return ctx.funding.complete(actorOf(user), req.params.id, orderId, user);
  });

  app.post<{ Params: IdParams }>('/milestones/:id/funding/cancel', async (req) => {
    const user = requireUser(req);
    const m = await ctx.repos.milestones.getDTO(req.params.id);
    if (!m) throw notFound('Milestone');
    await ctx.repos.audit.append({
      actorId: user.id,
      actorRole: user.role,
      action: 'funding.cancelled_by_buyer',
      entityType: 'milestone',
      entityId: m.id,
    });
    return m;
  });

  // Deliverables → verification agent
  app.post<{ Params: IdParams }>(
    '/milestones/:id/submissions',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const user = requireUser(req);
      const input = parseOrThrow(SubmissionInputSchema, req.body, 'submission');
      const result = await ctx.submissions.submit(user, req.params.id, input);
      return reply.status(202).send(result);
    },
  );

  // Disputes and human review
  app.post<{ Params: IdParams }>('/milestones/:id/disputes', async (req) => {
    const { reason } = parseOrThrow(DisputeInputSchema, req.body, 'dispute');
    return ctx.disputes.raise(requireUser(req), req.params.id, reason);
  });

  app.post<{ Params: IdParams }>('/milestones/:id/resolve', async (req) => {
    const { action, note } = parseOrThrow(ResolveInputSchema, req.body, 'resolution');
    return ctx.disputes.resolve(requireUser(req), req.params.id, action, note);
  });

  app.post<{ Params: IdParams }>('/milestones/:id/refund', async (req) => {
    const { reason } = parseOrThrow(RefundInputSchema, req.body, 'refund');
    return ctx.disputes.refund(requireUser(req), req.params.id, reason);
  });

  app.post<{ Params: IdParams }>('/milestones/:id/release-now', async (req) => ctx.disputes.waiveWindow(requireUser(req), req.params.id));

  app.post<{ Params: IdParams }>('/milestones/:id/reverify', async (req) => ctx.disputes.reverify(requireUser(req), req.params.id));
};
