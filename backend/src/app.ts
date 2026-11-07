import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env';
import { createContext, type ContextOverrides } from './context';
import { registerDemoAuth } from './http/plugins/auth';
import { registerErrorHandling } from './http/plugins/errors';
import { registerWeb } from './http/plugins/web';
import { agentRoutes } from './http/routes/agent';
import { contractRoutes } from './http/routes/contracts';
import { dashboardRoutes } from './http/routes/dashboard';
import { demoRoutes } from './http/routes/demo';
import { eventRoutes } from './http/routes/events';
import { milestoneRoutes } from './http/routes/milestones';
import { systemRoutes } from './http/routes/system';
import { webhookRoutes } from './http/routes/webhooks';
import './http/types';
import { REDACT_PATHS } from './lib/logger';

export async function buildApp(config: AppConfig, overrides: ContextOverrides = {}): Promise<FastifyInstance> {
  const pretty = config.env === 'development';
  const app = Fastify({
    logger:
      config.env === 'test'
        ? false
        : {
            level: config.logLevel,
            redact: { paths: REDACT_PATHS, censor: '[redacted]' },
            transport: pretty ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname,reqId' } } : undefined,
          },
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: true,
  });

  for (const w of config.warnings) app.log.warn(w);

  const ctx = await createContext(config, app.log, overrides);
  app.decorate('ctx', ctx);
  app.addHook('onClose', async () => ctx.close());

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'https:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    allowedHeaders: ['content-type', 'x-demo-user'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });

  registerErrorHandling(app);
  registerDemoAuth(app);

  await app.register(
    async (api) => {
      await api.register(systemRoutes);
      await api.register(contractRoutes);
      await api.register(milestoneRoutes);
      await api.register(dashboardRoutes);
      await api.register(eventRoutes);
      await api.register(agentRoutes);
      await api.register(demoRoutes);
      await api.register(webhookRoutes);
    },
    { prefix: '/api' },
  );

  await registerWeb(app);

  app.log.info(
    { paypal: ctx.paypal.mode, llm: `${ctx.llm.mode}:${ctx.llm.model}`, github: config.github.mode, escrow: config.escrowMode, db: ctx.dialect },
    'ArbiterAI ready',
  );
  return app;
}
