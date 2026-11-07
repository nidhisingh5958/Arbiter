import type { FastifyPluginAsync } from 'fastify';

/**
 * PayPal webhook receiver. Registered in its own encapsulated scope so the JSON body is kept
 * as the exact raw string — required for signature verification.
 */
export const webhookRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string', bodyLimit: 1_048_576 }, (_req, body, done) => done(null, body));

  app.post('/webhooks/paypal', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    const result = await ctx.webhooks.handle(raw, req.headers);
    return reply.status(200).send(result);
  });
};
