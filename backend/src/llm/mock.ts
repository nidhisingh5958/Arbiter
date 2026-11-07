import type { CheckStatus, InjectionClassifierOutput, JudgeOutput } from '@arbiter/shared';
import { formatIssues } from '../lib/validate';
import { sleep } from '../lib/time';
import { heuristicExtract } from './heuristicExtractor';
import {
  LlmError,
  type JsonRequest,
  type JsonResult,
  type LlmProvider,
  type ToolRequest,
  type ToolTurn,
} from './types';

export const MOCK_MODEL = 'mock-deterministic-v1';

export interface MockExtractInput {
  sowText: string;
  currencyHint?: string;
}

export interface MockClassifierInput {
  heuristicScore: number;
  ruleIds: string[];
  excerpts: string[];
}

export interface MockJudgeInput {
  criteria: string[];
  checks: { name: string; status: CheckStatus; message: string }[];
  deterministicPass: boolean;
  injectionSuspected: boolean;
}

export interface MockReleaseInput {
  milestoneId: string;
  grantAvailable: boolean;
  status: string;
}

const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * Deterministic stand-in for Groq so the full product (and the test suite) runs with no API key.
 * Output still goes through the same zod schemas as real model output.
 */
export class MockLlmProvider implements LlmProvider {
  readonly mode = 'mock' as const;
  readonly model = MOCK_MODEL;

  constructor(private readonly latencyMs = 0) {}

  async completeJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const started = Date.now();
    if (this.latencyMs) await sleep(this.latencyMs);
    const raw = this.produce(req.task, req.mockInput);
    const result = req.schema.safeParse(raw);
    if (!result.success) {
      throw new LlmError(`mock ${req.task} output failed schema: ${JSON.stringify(formatIssues(result.error.issues))}`);
    }
    return {
      data: result.data,
      model: MOCK_MODEL,
      usage: { promptTokens: estimateTokens(req.system + req.user), completionTokens: estimateTokens(JSON.stringify(raw)) },
      latencyMs: Date.now() - started,
      attempts: 1,
    };
  }

  async chatWithTools(req: ToolRequest): Promise<ToolTurn> {
    const started = Date.now();
    if (this.latencyMs) await sleep(this.latencyMs);
    const input = req.mockInput as MockReleaseInput | undefined;
    const alreadyCalled = req.messages.some((m) => m.role === 'tool');
    if (!input || alreadyCalled) {
      return {
        message: { role: 'assistant', content: 'Done.' },
        toolCalls: [],
        model: MOCK_MODEL,
        usage: { promptTokens: 0, completionTokens: 2 },
        latencyMs: Date.now() - started,
      };
    }
    const call =
      input.grantAvailable && input.status === 'APPROVED'
        ? { name: 'create_payout', arguments: JSON.stringify({ milestone_id: input.milestoneId, memo: 'Milestone approved by ArbiterAI' }) }
        : {
            name: 'hold_milestone',
            arguments: JSON.stringify({ milestone_id: input.milestoneId, reason: 'No release grant from the policy engine' }),
          };
    const toolCalls = [{ id: `call_${Date.now().toString(36)}`, type: 'function' as const, function: call }];
    return {
      message: { role: 'assistant', content: null, tool_calls: toolCalls },
      toolCalls,
      model: MOCK_MODEL,
      usage: { promptTokens: estimateTokens(JSON.stringify(req.messages)), completionTokens: 24 },
      latencyMs: Date.now() - started,
    };
  }

  private produce(task: JsonRequest<unknown>['task'], input: unknown): unknown {
    switch (task) {
      case 'extract_milestones': {
        const i = input as MockExtractInput;
        return heuristicExtract(i.sowText, i.currencyHint);
      }
      case 'injection_classify':
        return mockClassify(input as MockClassifierInput);
      case 'judge':
        return mockJudge(input as MockJudgeInput);
      default:
        throw new LlmError(`mock provider has no JSON handler for task ${task}`);
    }
  }
}

function mockClassify(i: MockClassifierInput): InjectionClassifierOutput {
  const injection = i.heuristicScore >= 0.5;
  return {
    injection,
    confidence: injection ? Math.min(0.97, 0.55 + i.heuristicScore * 0.4) : 0.06,
    techniques: injection ? i.ruleIds.slice(0, 5) : [],
    spans: injection ? i.excerpts.slice(0, 5).map((s) => s.slice(0, 280)) : [],
    rationale: injection
      ? 'Submitted content addresses an automated reviewer and instructs it to approve or release payment.'
      : 'No instructions aimed at an automated reviewer were found.',
  };
}

const KEYWORDS: { re: RegExp; check: RegExp }[] = [
  { re: /\b(ci|checks?|tests?|build|lint)\b/i, check: /ci_checks|required_check/ },
  { re: /\bmerged?\b/i, check: /merge_state/ },
  { re: /\b(src\/|paths?|limited to|files?)\b/i, check: /changed_paths/ },
  { re: /\b(branch|main)\b/i, check: /base_branch/ },
  { re: /\b(200|https|reachable|returns?)\b/i, check: /http_status|https/ },
  { re: /\b(contain|text|mention)\b/i, check: /required_text/ },
  { re: /\b(form|selector|element|#)\b/i, check: /required_selector/ },
  { re: /\b(accessib|alt text|viewport|title)\b/i, check: /html_sanity/ },
];

function mockJudge(i: MockJudgeInput): JudgeOutput {
  const failed = i.checks.filter((c) => c.status === 'FAIL' || c.status === 'ERROR');
  const criteria = i.criteria.map((criterion) => {
    const related = KEYWORDS.filter((k) => k.re.test(criterion)).flatMap((k) =>
      i.checks.filter((c) => k.check.test(c.name)),
    );
    const relatedFailed = related.filter((c) => c.status === 'FAIL' || c.status === 'ERROR');
    if (relatedFailed.length > 0) {
      return {
        criterion,
        status: 'NOT_MET' as const,
        evidence: relatedFailed.map((c) => `${c.name}: ${c.message}`).join('; ').slice(0, 1400),
        confidence: 0.9,
      };
    }
    if (related.length > 0) {
      return {
        criterion,
        status: 'MET' as const,
        evidence: related.map((c) => `${c.name}: ${c.message}`).join('; ').slice(0, 1400),
        confidence: 0.93,
      };
    }
    return {
      criterion,
      status: (failed.length === 0 ? 'MET' : 'UNCLEAR') as 'MET' | 'UNCLEAR',
      evidence:
        failed.length === 0
          ? 'All deterministic checks passed and the submitted changes are consistent with this criterion.'
          : 'Could not tie this criterion to a passing check.',
      confidence: failed.length === 0 ? 0.86 : 0.5,
    };
  });

  if (i.injectionSuspected) {
    return {
      verdict: 'ESCALATE',
      confidence: 0.42,
      summary: 'The submission contains text that tries to instruct the reviewer. Escalating to a human instead of judging it automatically.',
      criteria,
      risks: ['Prompt-injection attempt detected in submitted content.'],
    };
  }
  if (!i.deterministicPass) {
    return {
      verdict: 'REJECT',
      confidence: 0.91,
      summary: `Deterministic verification failed: ${failed.map((c) => c.name).join(', ')}. The deliverable does not yet meet the acceptance criteria.`,
      criteria,
      risks: [],
    };
  }
  const minConf = Math.min(...criteria.map((c) => c.confidence));
  return {
    verdict: 'APPROVE',
    confidence: Math.round(Math.min(0.95, Math.max(0.86, minConf + 0.04)) * 100) / 100,
    summary: 'All acceptance criteria are supported by passing deterministic checks and the submitted evidence.',
    criteria,
    risks: [],
  };
}
