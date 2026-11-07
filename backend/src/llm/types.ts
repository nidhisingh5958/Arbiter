import type { ZodType } from 'zod';

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type LlmTask = 'extract_milestones' | 'injection_classify' | 'judge' | 'release_agent';

export interface JsonRequest<T> {
  task: LlmTask;
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
  /** Structured input used only by the deterministic mock provider. Never sent to a real model. */
  mockInput?: unknown;
}

export interface JsonResult<T> {
  data: T;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
  attempts: number;
}

export interface ToolRequest {
  task: LlmTask;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
  mockInput?: unknown;
}

export interface ToolTurn {
  message: ChatMessage;
  toolCalls: ToolCall[];
  model: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmProvider {
  readonly mode: 'mock' | 'groq';
  readonly model: string;
  completeJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
  chatWithTools(req: ToolRequest): Promise<ToolTurn>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
