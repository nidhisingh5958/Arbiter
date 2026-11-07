import { z } from 'zod';
import type { AgentToolDTO } from '@arbiter/shared';
import { AppError, errorMessage } from '../../lib/errors';
import { formatIssues } from '../../lib/validate';
import type { ToolSpec } from '../../llm/types';
import { PayPalApiError } from '../../paypal/types';
import type { DecisionLog } from '../decisionLog';
import { PolicyDeniedError } from '../policy/grants';
import { TOOLS, type ToolDefinition, type ToolDeps, type ToolExecContext } from './definitions';

export type ToolOutcome =
  | { ok: true; output: Record<string, unknown> }
  | { ok: false; denied: boolean; error: string; cause: unknown };

function jsonSchemaFor(tool: ToolDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(tool.input) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/**
 * MCP-style tool gateway. Every payment action — whether requested by the LLM agent, a human
 * through the UI, a webhook, or an MCP client — goes through here: input validation, caller
 * allow-lists, human-only enforcement, release-grant checks (inside create_payout) and an
 * immutable TOOL_CALL entry in the decision log.
 */
export class ToolGateway {
  private readonly tools = new Map<string, ToolDefinition>(TOOLS.map((t) => [t.name, t]));

  constructor(
    private readonly deps: ToolDeps,
    private readonly decisionLog: DecisionLog,
  ) {}

  list(): AgentToolDTO[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      movesMoney: t.movesMoney,
      inputSchema: jsonSchemaFor(t),
    }));
  }

  specs(names: string[]): ToolSpec[] {
    return names
      .map((n) => this.tools.get(n))
      .filter((t): t is ToolDefinition => Boolean(t))
      .map((t) => ({ name: t.name, description: t.description, parameters: jsonSchemaFor(t) }));
  }

  async execute(name: string, rawArgs: unknown, ctx: ToolExecContext): Promise<ToolOutcome> {
    const started = Date.now();
    const tool = this.tools.get(name);
    const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
    const milestoneId = typeof args.milestone_id === 'string' ? args.milestone_id : null;

    try {
      if (!tool) throw new PolicyDeniedError(`Unknown tool "${name}"`);
      if (ctx.allowedTools && !ctx.allowedTools.includes(name)) {
        throw new PolicyDeniedError(`Tool ${name} is not available to ${ctx.actor}`);
      }
      if (tool.humanOnly && !ctx.actor.startsWith('user:')) throw new PolicyDeniedError(`${name} can only be initiated by a human`);
      const parsed = tool.input.safeParse(args);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_TOOL_INPUT', `Invalid input for ${name}`, { issues: formatIssues(parsed.error.issues) });
      }
      const output = await tool.run(parsed.data, ctx, this.deps);
      await this.decisionLog.append({
        milestoneId,
        action: 'TOOL_CALL',
        actor: ctx.actor,
        inputs: { tool: name, args: parsed.data, grantPresent: Boolean(ctx.grantToken) },
        outputs: { tool: name, ok: true, movesMoney: tool.movesMoney, result: output },
        latencyMs: Date.now() - started,
      });
      return { ok: true, output };
    } catch (err) {
      const denied = err instanceof PolicyDeniedError;
      const error =
        err instanceof PayPalApiError ? `PayPal ${err.issue}: ${err.message}${err.debugId ? ` (debug id ${err.debugId})` : ''}` : errorMessage(err);
      await this.decisionLog.append({
        milestoneId,
        action: 'TOOL_CALL',
        actor: ctx.actor,
        inputs: { tool: name, args, grantPresent: Boolean(ctx.grantToken) },
        outputs: { tool: name, ok: false, denied, error },
        latencyMs: Date.now() - started,
      });
      this.deps.log.warn({ tool: name, actor: ctx.actor, denied, error }, 'tool call failed');
      return { ok: false, denied, error, cause: err };
    }
  }

  /** Convenience for service code paths that should surface failures as HTTP errors. */
  async executeOrThrow(name: string, args: Record<string, unknown>, ctx: ToolExecContext): Promise<Record<string, unknown>> {
    const res = await this.execute(name, args, ctx);
    if (res.ok) return res.output;
    if (res.cause instanceof AppError) throw res.cause;
    if (res.cause instanceof PayPalApiError) {
      const status = res.cause.issue === 'ORDER_NOT_APPROVED' ? 409 : res.cause.status >= 500 ? 502 : 422;
      throw new AppError(status, 'PAYPAL_ERROR', res.error, { issue: res.cause.issue, debugId: res.cause.debugId });
    }
    throw new AppError(502, 'TOOL_FAILED', res.error);
  }
}
