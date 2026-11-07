import { formatMoney, type PolicyEvaluation } from '@arbiter/shared';
import type { MilestonesTable } from '../db/types';
import type { ChatMessage, LlmProvider, LlmUsage } from '../llm';
import type { MockReleaseInput } from '../llm/mock';
import { RELEASE_AGENT_SYSTEM } from '../llm/prompts';
import type { ReleaseGrant } from './policy/grants';
import type { ToolGateway } from './tools/gateway';

export const RELEASE_AGENT_TOOLS = ['create_payout', 'hold_milestone', 'get_payout_status'];
const MAX_STEPS = 3;

export interface ReleaseAgentCall {
  name: string;
  ok: boolean;
  denied: boolean;
  output: Record<string, unknown> | null;
  error: string | null;
}

export interface ReleaseAgentResult {
  calls: ReleaseAgentCall[];
  model: string | null;
  usage: LlmUsage;
  error: string | null;
}

/**
 * The payments agent: an LLM tool-use loop that decides between create_payout and
 * hold_milestone. It is pinned to one milestone, sees no credentials, and the grant
 * that authorizes money movement is attached server-side by the gateway.
 */
export async function runReleaseAgent(
  llm: LlmProvider,
  gateway: ToolGateway,
  milestone: MilestonesTable,
  grant: ReleaseGrant | null,
  evaluation: PolicyEvaluation | null,
): Promise<ReleaseAgentResult> {
  const usage: LlmUsage = { promptTokens: 0, completionTokens: 0 };
  const calls: ReleaseAgentCall[] = [];
  let model: string | null = null;

  const messages: ChatMessage[] = [
    { role: 'system', content: RELEASE_AGENT_SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        milestone_id: milestone.id,
        title: milestone.title,
        status: milestone.status,
        amount: formatMoney(milestone.amount_cents, milestone.currency),
        decision_verdict: milestone.decision_verdict,
        decision_confidence: milestone.decision_confidence,
        policy_outcome: evaluation?.outcome ?? 'HUMAN_OVERRIDE',
        grant_available: Boolean(grant),
      }),
    },
  ];
  const mockInput: MockReleaseInput = { milestoneId: milestone.id, grantAvailable: Boolean(grant), status: milestone.status };

  for (let step = 0; step < MAX_STEPS; step++) {
    let turn;
    try {
      turn = await llm.chatWithTools({ task: 'release_agent', messages, tools: gateway.specs(RELEASE_AGENT_TOOLS), mockInput });
    } catch (e) {
      return { calls, model, usage, error: (e as Error).message };
    }
    model = turn.model;
    usage.promptTokens += turn.usage.promptTokens;
    usage.completionTokens += turn.usage.completionTokens;
    if (turn.toolCalls.length === 0) break;
    messages.push(turn.message);

    for (const tc of turn.toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      // The agent may only act on the milestone it was invoked for.
      args.milestone_id = milestone.id;
      const outcome = await gateway.execute(tc.function.name, args, {
        actor: 'agent:payments',
        grantToken: grant?.token,
        allowedTools: RELEASE_AGENT_TOOLS,
      });
      calls.push({
        name: tc.function.name,
        ok: outcome.ok,
        denied: outcome.ok ? false : outcome.denied,
        output: outcome.ok ? outcome.output : null,
        error: outcome.ok ? null : outcome.error,
      });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(outcome.ok ? outcome.output : { error: outcome.error, denied: outcome.denied }),
      });
    }
    if (calls.some((c) => c.ok && (c.name === 'create_payout' || c.name === 'hold_milestone'))) break;
  }
  return { calls, model, usage, error: null };
}
