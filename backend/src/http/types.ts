import type { UserDTO } from '@arbiter/shared';
import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { unauthorized } from '../lib/errors';

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    user: UserDTO | null;
  }
}

export function requireUser(req: FastifyRequest): UserDTO {
  if (!req.user) throw unauthorized();
  return req.user;
}

export type IdParams = { id: string };
