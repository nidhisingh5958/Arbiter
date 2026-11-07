import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Serves the built SPA (frontend/dist) from the API in single-service deployments (Docker, Render). */
export async function registerWeb(app: FastifyInstance): Promise<void> {
  const { serveWeb, webDistDir } = app.ctx.config;
  const indexFile = path.join(webDistDir, 'index.html');
  const enabled = serveWeb && fs.existsSync(indexFile);
  if (serveWeb && !enabled) app.log.warn({ webDistDir }, 'SERVE_WEB=true but frontend/dist was not found — run `npm run build`');

  if (enabled) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
      wildcard: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    if (enabled && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.type('text/html').header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.url.split('?')[0]}` } });
  });
}
