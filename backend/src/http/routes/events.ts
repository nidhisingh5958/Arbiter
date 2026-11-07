import type { ServerEvent } from '@arbiter/shared';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Server-Sent Events stream for live dashboards. Broadcasts milestone, payment, inspection,
 * decision, webhook and agent-step events. Payloads carry ids/statuses only — never secrets.
 */
export const eventRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get('/events', (req, reply) => {
    const origin = req.headers.origin;
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };
    if (origin && ctx.config.corsOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, headers);
    res.write('retry: 3000\n\n');

    const send = (event: ServerEvent) => {
      res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'hello', serverTime: new Date().toISOString(), id: 'hello', at: new Date().toISOString() });
    for (const e of ctx.bus.recentEvents(25)) send(e);

    const unsubscribe = ctx.bus.subscribe(send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
};
