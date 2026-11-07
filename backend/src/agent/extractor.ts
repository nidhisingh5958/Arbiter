import {
  ContractDraftSchema,
  ExtractionOutputSchema,
  FileParamsSchema,
  GithubPrParamsSchema,
  UrlParamsSchema,
  toCents,
  type ContractDraft,
  type ExtractIssue,
  type ExtractionOutput,
  type MilestoneDraft,
  type Verification,
} from '@arbiter/shared';
import { isoDatePlusDays } from '../lib/time';
import { formatIssues } from '../lib/validate';
import type { LlmProvider, LlmUsage } from '../llm';
import type { MockExtractInput } from '../llm/mock';
import { EXTRACTION_SYSTEM } from '../llm/prompts';

export interface ExtractionResult {
  draft: ContractDraft;
  issues: ExtractIssue[];
  model: string;
  usage: LlmUsage;
  latencyMs: number;
  raw: ExtractionOutput;
}

/**
 * SOW → milestones. The LLM proposes a loose structure; we normalize units (cents), fill safe
 * defaults, coerce verification params through strict schemas, then validate the whole draft.
 * Validation issues (e.g. amounts not summing to the total) are returned for the buyer to fix.
 */
export async function extractContract(llm: LlmProvider, sowText: string, currencyHint?: string): Promise<ExtractionResult> {
  const mockInput: MockExtractInput = { sowText, currencyHint };
  const res = await llm.completeJson({
    task: 'extract_milestones',
    system: EXTRACTION_SYSTEM,
    user: `Today is ${new Date().toISOString().slice(0, 10)}.${currencyHint ? ` Preferred currency: ${currencyHint}.` : ''}\n\nSTATEMENT OF WORK (data):\n"""\n${sowText}\n"""`,
    schema: ExtractionOutputSchema,
    maxTokens: 2500,
    mockInput,
  });

  const raw = res.data;
  const currency = (currencyHint ?? raw.currency ?? 'USD').toUpperCase().slice(0, 3);
  const issues: ExtractIssue[] = [];
  const milestones: MilestoneDraft[] = raw.milestones.map((m, i) => {
    const verification = normalizeVerification(m.verification, i, issues);
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(m.deadline) ? m.deadline : isoDatePlusDays(14 * (i + 1));
    if (deadline !== m.deadline) issues.push({ path: `milestones.${i}.deadline`, message: 'No deadline found in the SOW — a default was proposed; please confirm.' });
    return {
      title: m.title.trim().slice(0, 120) || `Milestone ${i + 1}`,
      description: m.description.trim().slice(0, 2000),
      acceptanceCriteria: m.acceptanceCriteria.map((c) => c.trim()).filter((c) => c.length >= 3).slice(0, 12),
      amountCents: toCents(m.amount),
      currency,
      deadline,
      verification,
    };
  });

  const draft: ContractDraft = {
    title: raw.title.trim().slice(0, 140),
    summary: raw.summary.trim().slice(0, 1000),
    currency,
    totalCents: toCents(raw.total),
    milestones,
  };

  const strict = ContractDraftSchema.safeParse(draft);
  if (!strict.success) issues.push(...formatIssues(strict.error.issues));

  return { draft, issues: dedupe(issues), model: res.model, usage: res.usage, latencyMs: res.latencyMs, raw };
}

function normalizeVerification(v: { type: string; params: Record<string, unknown> }, index: number, issues: ExtractIssue[]): Verification {
  const type = v.type.toUpperCase();
  const path = `milestones.${index}.verification`;
  if (type === 'GITHUB_PR') {
    const parsed = GithubPrParamsSchema.safeParse(v.params);
    if (parsed.success) return { type: 'GITHUB_PR', params: parsed.data };
    issues.push({ path, message: 'GitHub verification details were incomplete — please set the repository.' });
    return { type: 'GITHUB_PR', params: GithubPrParamsSchema.parse({ repo: 'owner/repo' }) };
  }
  if (type === 'URL') {
    const parsed = UrlParamsSchema.safeParse(v.params);
    if (parsed.success) return { type: 'URL', params: parsed.data };
    issues.push({ path, message: 'URL verification details were incomplete — please review.' });
    return { type: 'URL', params: UrlParamsSchema.parse({}) };
  }
  const parsed = FileParamsSchema.safeParse(v.params);
  return { type: 'FILE', params: parsed.success ? parsed.data : FileParamsSchema.parse({}) };
}

function dedupe(issues: ExtractIssue[]): ExtractIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.path}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
