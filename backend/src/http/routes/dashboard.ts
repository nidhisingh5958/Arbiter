import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../types';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get('/dashboard/summary', async (req) => ctx.insights.summary(requireUser(req)));
  app.get('/dashboard/milestones', async (req) => ctx.insights.milestones(requireUser(req)));
  app.get('/dashboard/inspections', async (req) => ctx.insights.inspections(requireUser(req)));
  app.get('/dashboard/transactions', async (req) => ctx.insights.transactions(requireUser(req)));
  app.get('/dashboard/decisions', async (req) => ctx.insights.decisions(requireUser(req)));
  app.get('/dashboard/webhooks', async (req) => {
    requireUser(req);
    return ctx.insights.webhooks();
  });

  app.get('/audit/verify-chain', async (req) => {
    requireUser(req);
    return ctx.decisionLog.verifyChain();
  });
};
