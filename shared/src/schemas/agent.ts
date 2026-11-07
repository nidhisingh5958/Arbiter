import { z } from 'zod';
import { VerdictSchema } from '../enums';

export const CriterionStatusSchema = z.enum(['MET', 'NOT_MET', 'UNCLEAR']);
export type CriterionStatus = z.infer<typeof CriterionStatusSchema>;

/** Structured output contract for the LLM judge. Validated before anything reads it. */
export const JudgeOutputSchema = z.object({
  verdict: VerdictSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(2000),
  criteria: z
    .array(
      z.object({
        criterion: z.string().trim().min(1).max(500),
        status: CriterionStatusSchema,
        evidence: z.string().trim().max(1500),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(20),
  risks: z.array(z.string().trim().max(500)).max(10).default([]),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

export const InjectionClassifierSchema = z.object({
  injection: z.boolean(),
  confidence: z.number().min(0).max(1),
  techniques: z.array(z.string().max(120)).max(10).default([]),
  spans: z.array(z.string().max(300)).max(5).default([]),
  rationale: z.string().max(1000).default(''),
});
export type InjectionClassifierOutput = z.infer<typeof InjectionClassifierSchema>;

/** Loose shape the LLM returns for SOW extraction (major units); normalized server-side. */
export const ExtractionOutputSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).default(''),
  currency: z.string().default('USD'),
  total: z.number().positive(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(3000).default(''),
        acceptanceCriteria: z.array(z.string()).default([]),
        amount: z.number().nonnegative(),
        deadline: z.string().default(''),
        verification: z
          .object({
            type: z.string().default('FILE'),
            params: z.record(z.string(), z.unknown()).default({}),
          })
          .default({ type: 'FILE', params: {} }),
      }),
    )
    .min(1)
    .max(10),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export interface PolicyRuleResult {
  rule: string;
  passed: boolean;
  detail: string;
}

export type PolicyOutcome = 'AUTO_RELEASE' | 'ESCALATE' | 'REJECT';

export interface PolicyEvaluation {
  outcome: PolicyOutcome;
  reasons: PolicyRuleResult[];
  evaluatedAt: string;
}
