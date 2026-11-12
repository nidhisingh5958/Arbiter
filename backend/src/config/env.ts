import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { EscrowMode, PolicyInput } from '@arbiter/shared';
import { ESCROW_MODES, toCents } from '@arbiter/shared';

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  version: string;
  port: number;
  host: string;
  logLevel: string;
  publicWebUrl: string;
  corsOrigins: string[];
  serveWeb: boolean;
  webDistDir: string;
  databaseUrl: string | null;
  databaseSsl: boolean;
  sqlitePath: string;
  appSecret: string;
  llm: {
    mode: 'mock' | 'groq';
    apiKey: string | null;
    model: string;
    baseUrl: string;
    timeoutMs: number;
    maxRetries: number;
    costPer1MInput: number;
    costPer1MOutput: number;
  };
  paypal: {
    mode: 'mock' | 'sandbox';
    clientId: string | null;
    clientSecret: string | null;
    webhookId: string | null;
    payoutReceiverEmail: string | null;
    brandName: string;
    baseUrl: string;
    mockPayoutDelayMs: number;
  };
  escrowMode: EscrowMode;
  github: { mode: 'mock' | 'live'; token: string | null };
  policyDefaults: PolicyInput;
  schedulerIntervalMs: number;
  schedulerEnabled: boolean;
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const DEV_SECRET = 'change-me-dev-only-secret-0123456789abcdef';

function str(env: Env, key: string): string | null {
  const v = env[key];
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function num(env: Env, key: string, def: number): number {
  const v = str(env, key);
  if (v === null) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${key} must be a number, got "${v}"`);
  return n;
}

function bool(env: Env, key: string, def: boolean): boolean {
  const v = str(env, key);
  if (v === null) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function oneOf<T extends string>(env: Env, key: string, allowed: readonly T[], def: T): T {
  const v = str(env, key);
  if (v === null) return def;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`Environment variable ${key} must be one of ${allowed.join(', ')}, got "${v}"`);
  }
  return v as T;
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Locate the repo-root .env by walking up from cwd (npm workspaces run with cwd = backend/). */
export function findEnvFile(start = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadEnvFile(): void {
  if (process.env.NODE_ENV === 'test') return;
  const file = findEnvFile();
  if (file) loadDotenv({ path: file, quiet: true });
}

function resolveWebDist(env: Env): string {
  const explicit = str(env, 'WEB_DIST_DIR');
  if (explicit) return path.resolve(explicit);
  // Works for both src/config (tsx) and dist/ (bundled) layouts.
  const candidates = [
    path.resolve(here, '../../../frontend/dist'),
    path.resolve(here, '../../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
  ];
  return candidates.find((c) => fs.existsSync(path.join(c, 'index.html'))) ?? candidates[0]!;
}

export function buildConfig(env: Env = process.env): AppConfig {
  const warnings: string[] = [];
  const nodeEnv = oneOf(env, 'NODE_ENV', ['development', 'production', 'test'] as const, 'development');
  const port = num(env, 'PORT', 8080);

  const publicWebUrl = (
    str(env, 'PUBLIC_WEB_URL') ??
    str(env, 'RENDER_EXTERNAL_URL') ??
    (nodeEnv === 'production' ? `http://localhost:${port}` : 'http://localhost:5173')
  ).replace(/\/+$/, '');

  let llmMode = oneOf(env, 'LLM_MODE', ['mock', 'groq'] as const, 'mock');
  const groqKey = str(env, 'GROQ_API_KEY');
  if (llmMode === 'groq' && !groqKey) {
    warnings.push('LLM_MODE=groq but GROQ_API_KEY is empty — falling back to deterministic mock LLM.');
    llmMode = 'mock';
  }

  let paypalMode = oneOf(env, 'PAYPAL_MODE', ['mock', 'sandbox'] as const, 'mock');
  const clientId = str(env, 'PAYPAL_CLIENT_ID');
  const clientSecret = str(env, 'PAYPAL_CLIENT_SECRET');
  if (paypalMode === 'sandbox' && (!clientId || !clientSecret)) {
    warnings.push('PAYPAL_MODE=sandbox but client id/secret are missing — falling back to mock PayPal.');
    paypalMode = 'mock';
  }
  const webhookId = str(env, 'PAYPAL_WEBHOOK_ID');
  if (paypalMode === 'sandbox' && !webhookId) {
    warnings.push('PAYPAL_WEBHOOK_ID is empty — incoming PayPal webhooks will be rejected (status polling still works).');
  }

  let githubMode = oneOf(env, 'GITHUB_MODE', ['mock', 'live'] as const, 'mock');
  const githubToken = str(env, 'GITHUB_TOKEN');
  if (githubMode === 'live' && !githubToken) {
    warnings.push('GITHUB_MODE=live without GITHUB_TOKEN — unauthenticated GitHub API is limited to 60 requests/hour.');
  }
  if (!['mock', 'live'].includes(githubMode)) githubMode = 'mock';

  const appSecret = str(env, 'APP_SECRET') ?? DEV_SECRET;
  if (appSecret === DEV_SECRET && nodeEnv === 'production') {
    warnings.push('APP_SECRET is the development default — set a random value in production.');
  }
  if (appSecret.length < 16) throw new Error('APP_SECRET must be at least 16 characters');

  return {
    env: nodeEnv,
    version: str(env, 'APP_VERSION') ?? '1.0.0',
    port,
    host: str(env, 'HOST') ?? '0.0.0.0',
    logLevel: str(env, 'LOG_LEVEL') ?? (nodeEnv === 'test' ? 'silent' : 'info'),
    publicWebUrl,
    corsOrigins: (str(env, 'CORS_ORIGINS') ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    serveWeb: bool(env, 'SERVE_WEB', nodeEnv === 'production'),
    webDistDir: resolveWebDist(env),
    databaseUrl: str(env, 'DATABASE_URL'),
    databaseSsl: bool(env, 'DATABASE_SSL', false),
    sqlitePath: str(env, 'SQLITE_PATH') ?? './data/arbiter.sqlite',
    appSecret,
    llm: {
      mode: llmMode,
      apiKey: groqKey,
      model: str(env, 'GROQ_MODEL') ?? 'openai/gpt-oss-120b',
      baseUrl: (str(env, 'GROQ_BASE_URL') ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
      timeoutMs: num(env, 'LLM_TIMEOUT_MS', 30_000),
      maxRetries: num(env, 'LLM_MAX_RETRIES', 2),
      costPer1MInput: num(env, 'LLM_COST_PER_1M_INPUT', 0),
      costPer1MOutput: num(env, 'LLM_COST_PER_1M_OUTPUT', 0),
    },
    paypal: {
      mode: paypalMode,
      clientId,
      clientSecret,
      webhookId,
      payoutReceiverEmail: str(env, 'PAYPAL_PAYOUT_RECEIVER_EMAIL'),
      brandName: str(env, 'PAYPAL_BRAND_NAME') ?? 'ArbiterAI',
      baseUrl: (str(env, 'PAYPAL_BASE_URL') ?? 'https://api-m.sandbox.paypal.com').replace(/\/+$/, ''),
      mockPayoutDelayMs: num(env, 'MOCK_PAYOUT_DELAY_MS', 2_500),
    },
    escrowMode: oneOf(env, 'ESCROW_MODE', ESCROW_MODES, 'capture_then_payout'),
    github: { mode: githubMode, token: githubToken },
    policyDefaults: {
      minConfidence: num(env, 'POLICY_MIN_CONFIDENCE', 0.85),
      maxAutoReleaseCents: toCents(num(env, 'POLICY_MAX_AUTO_RELEASE', 1500)),
      dailyPayoutCapCents: toCents(num(env, 'POLICY_DAILY_PAYOUT_CAP', 5000)),
      humanApprovalAboveCents: toCents(num(env, 'POLICY_HUMAN_APPROVAL_ABOVE', 2000)),
      disputeWindowSeconds: num(env, 'POLICY_DISPUTE_WINDOW_SECONDS', 45),
    },
    schedulerIntervalMs: num(env, 'SCHEDULER_INTERVAL_MS', 3_000),
    schedulerEnabled: bool(env, 'SCHEDULER_ENABLED', nodeEnv !== 'test'),
    warnings,
  };
}
