import { InjectionClassifierSchema, type InjectionClassifierOutput, type Severity } from '@arbiter/shared';
import { randomNonce } from '../../lib/crypto';
import type { LlmProvider, LlmUsage } from '../../llm';
import type { MockClassifierInput } from '../../llm/mock';
import { CLASSIFIER_SYSTEM, wrapUntrusted, type UntrustedSource } from '../../llm/prompts';
import { scanHeuristics, severityForScore, type HeuristicReport } from './heuristics';

export interface InjectionReport {
  suspected: boolean;
  severity: Severity;
  heuristic: HeuristicReport;
  classifier: InjectionClassifierOutput | null;
  classifierError: string | null;
  model: string | null;
  usage: LlmUsage | null;
  latencyMs: number;
}

const HEURISTIC_THRESHOLD = 0.5;
const CLASSIFIER_THRESHOLD = 0.6;

/** Two-layer prompt-injection detection: regex heuristics plus an LLM classifier. Either can flag. */
export async function detectInjection(llm: LlmProvider, sources: UntrustedSource[]): Promise<InjectionReport> {
  const started = Date.now();
  const heuristic = scanHeuristics(sources);
  let classifier: InjectionClassifierOutput | null = null;
  let classifierError: string | null = null;
  let model: string | null = null;
  let usage: LlmUsage | null = null;

  const corpus = sources.filter((s) => s.content.trim().length > 0);
  if (corpus.length > 0) {
    try {
      const mockInput: MockClassifierInput = {
        heuristicScore: heuristic.score,
        ruleIds: [...new Set(heuristic.matches.map((m) => m.ruleId))],
        excerpts: heuristic.matches.map((m) => m.excerpt),
      };
      const res = await llm.completeJson({
        task: 'injection_classify',
        system: CLASSIFIER_SYSTEM,
        user: `Classify the following submitted content.\n\n${wrapUntrusted(corpus, randomNonce(), 4000)}`,
        schema: InjectionClassifierSchema,
        maxTokens: 500,
        mockInput,
      });
      classifier = res.data;
      model = res.model;
      usage = res.usage;
    } catch (e) {
      classifierError = (e as Error).message;
    }
  }

  const classifierFlag = Boolean(classifier?.injection && classifier.confidence >= CLASSIFIER_THRESHOLD);
  const suspected = heuristic.score >= HEURISTIC_THRESHOLD || classifierFlag;
  const combinedScore = Math.max(heuristic.score, classifierFlag ? (classifier?.confidence ?? 0) : 0);

  return {
    suspected,
    severity: suspected ? severityForScore(Math.max(combinedScore, 0.6)) : severityForScore(combinedScore),
    heuristic,
    classifier,
    classifierError,
    model,
    usage,
    latencyMs: Date.now() - started,
  };
}
