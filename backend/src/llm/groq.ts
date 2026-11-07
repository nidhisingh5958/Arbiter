import type { AppConfig } from '../config/env';
import { formatIssues } from '../lib/validate';
import type { Logger } from '../lib/logger';
import { sleep } from '../lib/time';
import {
  LlmError,
  type ChatMessage,
  type JsonRequest,
  type JsonResult,
  type LlmProvider,
  type LlmUsage,
  type ToolCall,
  type ToolRequest,
  type ToolTurn,
} from './types';

interface GroqChoice {
  message: { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] };
  finish_reason: string;
}

interface GroqResponse {
  id: string;
  model: string;
  choices: GroqChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Groq chat-completions client (OpenAI-compatible API). Retries 429/5xx/timeouts with
 * exponential backoff, enforces JSON mode + zod validation, and logs tokens and estimated cost.
 */
export class GroqProvider implements LlmProvider {
  readonly mode = 'groq' as const;

  constructor(
    private readonly cfg: AppConfig['llm'],
    private readonly log: Logger,
  ) {}

  get model(): string {
    return this.cfg.model;
  }

  async completeJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const messages: ChatMessage[] = [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ];
    const usage: LlmUsage = { promptTokens: 0, completionTokens: 0 };
    const started = Date.now();
    let lastProblem = 'no response';

    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await this.post(req.task, {
        model: this.cfg.model,
        messages,
        temperature: 0.1,
        max_completion_tokens: req.maxTokens ?? 1800,
        response_format: { type: 'json_object' },
      });
      usage.promptTokens += res.usage?.prompt_tokens ?? 0;
      usage.completionTokens += res.usage?.completion_tokens ?? 0;
      const content = res.choices[0]?.message.content ?? '';

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        lastProblem = 'response was not valid JSON';
        messages.push({ role: 'assistant', content }, { role: 'user', content: 'That was not valid JSON. Return only the JSON object.' });
        continue;
      }
      const result = req.schema.safeParse(parsed);
      if (result.success) {
        return { data: result.data, model: res.model ?? this.cfg.model, usage, latencyMs: Date.now() - started, attempts: attempt };
      }
      const issues = formatIssues(result.error.issues)
        .slice(0, 8)
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ');
      lastProblem = `schema validation failed (${issues})`;
      messages.push(
        { role: 'assistant', content },
        { role: 'user', content: `Your JSON failed validation: ${issues}. Return the corrected JSON object only.` },
      );
    }
    throw new LlmError(`Groq ${req.task} output rejected: ${lastProblem}`);
  }

  async chatWithTools(req: ToolRequest): Promise<ToolTurn> {
    const started = Date.now();
    const res = await this.post(req.task, {
      model: this.cfg.model,
      messages: req.messages,
      tools: req.tools.map((t) => ({ type: 'function', function: t })),
      tool_choice: 'auto',
      temperature: 0,
      max_completion_tokens: req.maxTokens ?? 600,
    });
    const msg = res.choices[0]?.message ?? { role: 'assistant' as const, content: null };
    return {
      message: { role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls },
      toolCalls: msg.tool_calls ?? [],
      model: res.model ?? this.cfg.model,
      usage: { promptTokens: res.usage?.prompt_tokens ?? 0, completionTokens: res.usage?.completion_tokens ?? 0 },
      latencyMs: Date.now() - started,
    };
  }

  private async post(task: string, body: Record<string, unknown>): Promise<GroqResponse> {
    const maxAttempts = Math.max(1, this.cfg.maxRetries + 1);
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.cfg.apiKey ?? ''}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
        });
        if (res.ok) {
          const json = (await res.json()) as GroqResponse;
          this.logUsage(task, json, Date.now() - started);
          return json;
        }
        const text = (await res.text()).slice(0, 400);
        if (res.status === 429 || res.status >= 500) {
          lastError = new LlmError(`Groq API ${res.status}: ${text}`, true);
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : backoff(attempt));
          continue;
        }
        throw new LlmError(`Groq API ${res.status}: ${text}`);
      } catch (err) {
        if (err instanceof LlmError && !err.retryable) throw err;
        lastError = err;
        const name = (err as { name?: string })?.name;
        if (name === 'TimeoutError' || name === 'AbortError' || name === 'TypeError') {
          await sleep(backoff(attempt));
          continue;
        }
        if (!(err instanceof LlmError)) throw new LlmError(`Groq request failed: ${(err as Error).message}`);
      }
    }
    throw lastError instanceof LlmError ? lastError : new LlmError(`Groq request failed after ${maxAttempts} attempts`);
  }

  private logUsage(task: string, res: GroqResponse, latencyMs: number): void {
    const promptTokens = res.usage?.prompt_tokens ?? 0;
    const completionTokens = res.usage?.completion_tokens ?? 0;
    const estCostUsd =
      (promptTokens / 1_000_000) * this.cfg.costPer1MInput + (completionTokens / 1_000_000) * this.cfg.costPer1MOutput;
    this.log.info({ task, model: res.model, promptTokens, completionTokens, latencyMs, estCostUsd }, 'llm call');
  }
}

function backoff(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 8_000) + Math.floor(Math.random() * 200);
}
