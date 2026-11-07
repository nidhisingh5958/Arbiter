import { buildConfig, type AppConfig } from '../src/config/env';
import { createContext, type AppContext, type ContextOverrides } from '../src/context';
import { silentLogger } from '../src/lib/logger';
import { DEMO_USER_IDS } from '../src/repositories';
import type { UserDTO } from '@arbiter/shared';

export function testConfig(extra: Record<string, string> = {}): AppConfig {
  return buildConfig({
    NODE_ENV: 'test',
    SQLITE_PATH: ':memory:',
    APP_SECRET: 'test-secret-0123456789abcdef',
    LLM_MODE: 'mock',
    PAYPAL_MODE: 'mock',
    GITHUB_MODE: 'mock',
    MOCK_PAYOUT_DELAY_MS: '15',
    POLICY_DISPUTE_WINDOW_SECONDS: '0',
    SCHEDULER_ENABLED: 'false',
    PUBLIC_WEB_URL: 'http://localhost:5173',
    ...extra,
  });
}

export async function makeCtx(extra: Record<string, string> = {}, overrides: ContextOverrides = {}): Promise<AppContext> {
  return createContext(testConfig(extra), silentLogger, overrides);
}

export async function users(ctx: AppContext): Promise<{ buyer: UserDTO; contractor: UserDTO; contractor2: UserDTO; admin: UserDTO }> {
  const get = async (id: string) => {
    const u = await ctx.repos.users.get(id);
    if (!u) throw new Error(`missing user ${id}`);
    return u;
  };
  return {
    buyer: await get(DEMO_USER_IDS.buyer),
    contractor: await get(DEMO_USER_IDS.contractor),
    contractor2: await get(DEMO_USER_IDS.contractor2),
    admin: await get(DEMO_USER_IDS.admin),
  };
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 4000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor timed out');
}
