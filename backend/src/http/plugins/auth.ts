import type { UserDTO } from '@arbiter/shared';
import type { FastifyInstance } from 'fastify';

const TTL_MS = 10_000;

/**
 * Demo authentication: the role switcher sends `x-demo-user: <userId>`. Users are seeded
 * personas (buyer, contractors, admin). Authorization rules are enforced in the services.
 * A production deployment would replace this with real sessions/OIDC.
 */
export function registerDemoAuth(app: FastifyInstance): void {
  const cache = new Map<string, { user: UserDTO | null; at: number }>();
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const header = req.headers['x-demo-user'];
    const id = Array.isArray(header) ? header[0] : header;
    if (!id || id.length > 64) return;
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) {
      req.user = hit.user;
      return;
    }
    const user = await app.ctx.repos.users.get(id);
    cache.set(id, { user, at: Date.now() });
    req.user = user;
  });
  app.addHook('onResponse', async (req) => {
    // A profile change (PATCH /users/me) must be visible immediately.
    if (req.method === 'PATCH' && req.user) cache.delete(req.user.id);
  });
}
