import type { AppConfig } from '../config/env';
import type { Logger } from '../lib/logger';
import { GroqProvider } from './groq';
import { MockLlmProvider } from './mock';
import type { LlmProvider } from './types';

export function createLlm(config: AppConfig, log: Logger): LlmProvider {
  if (config.llm.mode === 'groq') return new GroqProvider(config.llm, log);
  // A little latency in dev makes the live agent stepper visible; none in tests.
  return new MockLlmProvider(config.env === 'test' ? 0 : 350);
}

export * from './types';
export { MOCK_MODEL } from './mock';
