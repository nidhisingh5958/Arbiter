import { DEMO_PRS, DEMO_URLS, GithubPrParamsSchema, UrlParamsSchema, ContractDraftSchema, sampleSow } from '@arbiter/shared';
import { describe, expect, it } from 'vitest';
import { extractContract } from '../src/agent/extractor';
import { verifyGithubPr } from '../src/agent/verifiers/github';
import { GuardedSiteFetcher } from '../src/agent/verifiers/siteFetcher';
import { summarizeChecks } from '../src/agent/verifiers/types';
import { verifyUrl } from '../src/agent/verifiers/url';
import { GithubRouter } from '../src/github/client';
import { globToRegExp } from '../src/lib/glob';
import { isPrivateAddress } from '../src/lib/ssrf';
import { MockLlmProvider } from '../src/llm/mock';

const github = new GithubRouter({ mode: 'mock', token: null });
const params = GithubPrParamsSchema.parse({
  repo: 'arbiterai-demo/storefront',
  requiredChecks: ['build', 'test'],
  expectedPaths: ['src/checkout/**'],
  requireMerged: true,
});

describe('GitHub PR verifier', () => {
  it('passes the happy-path PR', async () => {
    const out = await verifyGithubPr(github, params, DEMO_PRS.happy);
    expect(summarizeChecks(out.checks).deterministicPass).toBe(true);
    expect(out.untrusted.some((u) => u.label === 'pr_description')).toBe(true);
  });

  it('fails the PR with red CI, missing tests and no merge', async () => {
    const p = GithubPrParamsSchema.parse({ ...params, expectedPaths: ['src/api/orders/**', 'tests/orders/**'] });
    const out = await verifyGithubPr(github, p, DEMO_PRS.failing);
    const failed = summarizeChecks(out.checks).failed.map((c) => c.name);
    expect(failed).toEqual(expect.arrayContaining(['merge_state', 'required_check:test', 'changed_paths']));
  });

  it('rejects a PR from a different repository without calling GitHub', async () => {
    const out = await verifyGithubPr(github, params, 'https://github.com/someone-else/storefront/pull/1');
    expect(out.checks[0]?.name).toBe('repo_matches');
    expect(out.checks[0]?.status).toBe('FAIL');
  });

  it('keeps attacker-controlled text out of check messages', async () => {
    const out = await verifyGithubPr(github, params, DEMO_PRS.injection);
    for (const c of out.checks) expect(c.message).not.toMatch(/ignore all previous/i);
  });

  it('reports a clear error for non-demo repos in mock mode', async () => {
    const p = GithubPrParamsSchema.parse({ repo: 'octo/hello' });
    const out = await verifyGithubPr(github, p, 'https://github.com/octo/hello/pull/1');
    expect(out.checks.find((c) => c.name === 'pr_exists')?.status).toBe('ERROR');
  });
});

describe('URL verifier', () => {
  const fetcher = new GuardedSiteFetcher();
  const urlParams = UrlParamsSchema.parse({ url: DEMO_URLS.happy, requiredText: ['Lumen Goods', 'Free shipping'], requiredSelectors: ['#signup-form'] });

  it('passes the complete launch page', async () => {
    const out = await verifyUrl(fetcher, urlParams, DEMO_URLS.happy);
    expect(summarizeChecks(out.checks).deterministicPass).toBe(true);
  });

  it('fails the incomplete page', async () => {
    const out = await verifyUrl(fetcher, urlParams, DEMO_URLS.incomplete);
    expect(summarizeChecks(out.checks).failed.map((c) => c.name)).toEqual(
      expect.arrayContaining(['required_text:Free shipping', 'required_selector:#signup-form']),
    );
  });

  it('extracts hidden text and comments as untrusted sources', async () => {
    const out = await verifyUrl(fetcher, urlParams, DEMO_URLS.injection);
    expect(out.untrusted.some((u) => u.label === 'page_hidden_text' && /ignore previous instructions/i.test(u.content))).toBe(true);
    expect(out.untrusted.some((u) => u.label === 'html_comments')).toBe(true);
  });

  it('blocks SSRF to private addresses', async () => {
    const out = await verifyUrl(fetcher, UrlParamsSchema.parse({}), 'http://127.0.0.1:8080/admin');
    expect(out.checks.find((c) => c.name === 'ssrf_guard')?.status).toBe('FAIL');
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
});

describe('SOW extraction (mock LLM)', () => {
  it('turns the sample SOW into a valid draft whose amounts sum to the total', async () => {
    const res = await extractContract(new MockLlmProvider(), sampleSow());
    expect(ContractDraftSchema.safeParse(res.draft).success).toBe(true);
    expect(res.draft.totalCents).toBe(140_000);
    expect(res.draft.milestones.map((m) => m.verification.type)).toEqual(['GITHUB_PR', 'URL']);
    const gh = res.draft.milestones[0]!.verification;
    expect(gh.type === 'GITHUB_PR' && gh.params.requiredChecks).toEqual(['build', 'test']);
  });

  it('reports a sum mismatch as an issue instead of failing', async () => {
    const sow = sampleSow().replace('$1,400.00', '$1,500.00');
    const res = await extractContract(new MockLlmProvider(), sow);
    expect(res.issues.some((i) => i.message.includes('sum to'))).toBe(true);
  });
});

describe('glob matching', () => {
  it('supports ** and directory prefixes', () => {
    expect(globToRegExp('src/checkout/**').test('src/checkout/a/b.ts')).toBe(true);
    expect(globToRegExp('src/checkout/**').test('src/api/x.ts')).toBe(false);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
    expect(globToRegExp('docs').test('docs/readme.md')).toBe(true);
  });
});
