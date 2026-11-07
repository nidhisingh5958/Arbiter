import type { ExtractionOutput } from '@arbiter/shared';
import { isoDatePlusDays } from '../lib/time';

/**
 * Deterministic SOW parser used by the mock LLM (offline demo + tests). It understands the
 * common "Milestone N — Title ($amount, due YYYY-MM-DD)" layout with bullet acceptance criteria,
 * backticked check names/paths and quoted required text.
 */
export function heuristicExtract(sow: string, currencyHint?: string): ExtractionOutput {
  const text = sow.replace(/\r\n/g, '\n');
  const currency = currencyHint ?? /\b(USD|EUR|GBP|INR|CAD|AUD|NGN|PHP)\b/.exec(text)?.[1] ?? 'USD';
  const lines = text.split('\n');
  const firstLine = lines.map((l) => l.trim()).find((l) => l.length > 0) ?? 'Statement of work';
  const title = firstLine.replace(/^statement of work\s*[—:–-]?\s*/i, '').slice(0, 120) || 'Statement of work';

  const headerRe = /^\s*(?:#+\s*)?(?:milestone|phase|deliverable|stage)\s*#?\s*\d+\b.*$/gim;
  const headers = [...text.matchAll(headerRe)];
  const blocks =
    headers.length > 0
      ? headers.map((h, i) => text.slice(h.index ?? 0, headers[i + 1]?.index ?? text.length))
      : [text];

  const preamble = headers.length > 0 ? text.slice(0, headers[0]?.index ?? 0) : '';
  const summary = preamble
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !/^total/i.test(l))
    .join(' ')
    .slice(0, 400);

  const milestones = blocks.map((b, i) => parseBlock(b, i));
  const totalMatch = /total[^$\n]*\$\s?([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  const sum = milestones.reduce((s, m) => s + m.amount, 0);
  const total = totalMatch?.[1] ? Number.parseFloat(totalMatch[1].replace(/,/g, '')) : sum;

  return { title, summary, currency, total: total > 0 ? total : sum || 1, milestones };
}

function parseBlock(block: string, index: number): ExtractionOutput['milestones'][number] {
  const blines = block.split('\n');
  const header = blines[0] ?? '';
  const title =
    header
      .replace(/^\s*(?:#+\s*)?(?:milestone|phase|deliverable|stage)\s*#?\s*\d+\s*[—:–-]*\s*/i, '')
      .replace(/\(.*?\)\s*$/, '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim() || `Milestone ${index + 1}`;

  const amountMatch = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(block);
  const amount = amountMatch?.[1] ? Number.parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
  const deadline = /\b(\d{4}-\d{2}-\d{2})\b/.exec(block)?.[1] ?? isoDatePlusDays(14 * (index + 1));

  const body = blines.slice(1);
  const bullets = body
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, '').replace(/`/g, '').trim());
  const prose = body
    .map((l) => l.trim())
    .filter((l) => l && !/^[-*•]\s+/.test(l) && !/^acceptance criteria:?$/i.test(l));
  const criteria =
    bullets.length > 0
      ? bullets
      : prose.filter((l) => /\b(must|should|shall|required)\b/i.test(l)).map((l) => l.replace(/`/g, ''));

  return {
    title,
    description: prose.join(' ').replace(/`/g, '').slice(0, 1000),
    acceptanceCriteria: criteria.length > 0 ? criteria : [`${title} is delivered as described`],
    amount,
    deadline,
    verification: inferVerification(block),
  };
}

function backticked(s: string): string[] {
  return [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.trim());
}

function inferVerification(block: string): ExtractionOutput['milestones'][number]['verification'] {
  const repo = /(?:github\.com\/|repo(?:sitory)?\s+)`?([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)`?/i
    .exec(block)?.[1]
    ?.replace(/[.,;:]+$/, '');
  if (repo) {
    const checksPhrase = /checks?\s+((?:`[^`]+`[\s,]*(?:and\s+)?)+)/i.exec(block)?.[1] ?? '';
    const ticks = backticked(block);
    return {
      type: 'GITHUB_PR',
      params: {
        repo,
        baseBranch: /merged into\s+`?([\w./-]+)`?/i.exec(block)?.[1]?.replace(/[.,;:]+$/, '') ?? 'main',
        requireMerged: /\bmerged\b/i.test(block),
        requiredChecks: backticked(checksPhrase),
        expectedPaths: ticks.filter((t) => t.includes('/') && t !== repo),
      },
    };
  }
  const url = [...block.matchAll(/https?:\/\/[^\s)'"`<>]+/g)]
    .map((m) => m[0].replace(/[.,;:]+$/, ''))
    .find((u) => !/github\.com/i.test(u));
  if (url) {
    return {
      type: 'URL',
      params: {
        url,
        requiredText: [...block.matchAll(/"([^"]{2,80})"/g)].map((m) => m[1]!),
        requiredSelectors: backticked(block).filter((t) => /^[#.][\w-]+$/.test(t)),
      },
    };
  }
  return { type: 'FILE', params: {} };
}
