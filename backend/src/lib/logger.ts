import type { FastifyBaseLogger } from 'fastify';

/** The subset of pino we rely on, so services can run with Fastify's logger or a silent one in tests. */
export type Logger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error' | 'debug'>;

const noop = () => undefined;

export const silentLogger: Logger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
} as unknown as Logger; // pino's overloaded signatures; no-ops satisfy every overload at runtime.

/** Pino redaction paths: secrets never reach logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["paypal-transmission-sig"]',
  'headers.authorization',
  '*.clientSecret',
  '*.apiKey',
  '*.access_token',
  '*.token',
];
