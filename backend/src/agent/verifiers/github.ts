import type { GithubPrParams } from '@arbiter/shared';
import { globToRegExp, matchesAny } from '../../lib/glob';
import { GithubApiError, type GithubApi, type GithubCheckRun, type GithubFile, type GithubPull } from '../../github/types';
import type { UntrustedSource } from '../../llm/prompts';
import { errored, fail, pass, warn, type CheckResult, type VerifierOutput } from './types';

const PR_URL_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?(?:[?#].*)?$/i;
const MAX_PATCH_CHARS_PER_FILE = 2_000;
const MAX_PATCH_FILES = 12;

export function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = PR_URL_RE.exec(url.trim());
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]) };
}

/**
 * GitHub PR verifier: existence, repo/branch match, merge state, required CI checks and
 * changed paths, all via the GitHub REST API. CI status stands in for re-running tests.
 */
export async function verifyGithubPr(api: GithubApi, params: GithubPrParams, url: string): Promise<VerifierOutput> {
  const checks: CheckResult[] = [];
  const untrusted: UntrustedSource[] = [];

  const ref = parsePrUrl(url);
  if (!ref) {
    checks.push(fail('pr_url_format', 'critical', 'Submission is not a GitHub pull request URL (https://github.com/owner/repo/pull/N)'));
    return { checks, untrusted, facts: {} };
  }
  const fullName = `${ref.owner}/${ref.repo}`;
  if (fullName.toLowerCase() !== params.repo.toLowerCase()) {
    checks.push(fail('repo_matches', 'critical', `Pull request is not in the contracted repository ${params.repo}`, { expected: params.repo, actual: fullName }));
    return { checks, untrusted, facts: {} };
  }
  checks.push(pass('repo_matches', `Pull request targets the contracted repository ${params.repo}`, { repo: fullName }));

  let pr: GithubPull;
  try {
    pr = await api.getPull(ref.owner, ref.repo, ref.number);
  } catch (e) {
    if (e instanceof GithubApiError && e.status === 404) {
      checks.push(fail('pr_exists', 'critical', `Pull request #${ref.number} does not exist in ${params.repo}`));
    } else {
      checks.push(errored('pr_exists', `Could not load pull request #${ref.number}: ${(e as Error).message}`));
    }
    return { checks, untrusted, facts: {} };
  }
  checks.push(
    pass('pr_exists', `Pull request #${pr.number} exists (${pr.state}${pr.merged ? ', merged' : ''})`, {
      number: pr.number,
      state: pr.state,
      author: pr.user.login,
      url: pr.html_url,
    }),
  );
  untrusted.push({ label: 'pr_title', content: pr.title }, { label: 'pr_description', content: pr.body ?? '' });

  checks.push(
    pr.base.ref === params.baseBranch
      ? pass('base_branch', `Targets the required base branch ${params.baseBranch}`, { base: pr.base.ref })
      : fail('base_branch', 'high', `Targets a different base branch than the required ${params.baseBranch}`, { base: pr.base.ref }),
  );

  checks.push(mergeCheck(pr, params.requireMerged));

  const [ciChecks, files] = await Promise.all([ciResults(api, ref.owner, ref.repo, pr, params.requiredChecks, untrusted), loadFiles(api, ref, checks)]);
  checks.push(...ciChecks);

  if (files) {
    checks.push(pathCheck(files, params.expectedPaths));
    untrusted.push({ label: 'changed_file_names', content: files.map((f) => f.filename).join('\n') });
    for (const f of files.filter((x) => x.patch).slice(0, MAX_PATCH_FILES)) {
      untrusted.push({ label: `diff:${f.filename}`, content: (f.patch ?? '').slice(0, MAX_PATCH_CHARS_PER_FILE) });
    }
  }

  return {
    checks,
    untrusted,
    facts: {
      pullRequest: { number: pr.number, state: pr.state, merged: pr.merged, additions: pr.additions, deletions: pr.deletions },
      changedFileCount: files?.length ?? null,
      linesAdded: files?.reduce((s, f) => s + f.additions, 0) ?? null,
      linesDeleted: files?.reduce((s, f) => s + f.deletions, 0) ?? null,
    },
  };
}

function mergeCheck(pr: GithubPull, requireMerged: boolean): CheckResult {
  if (pr.merged) return pass('merge_state', 'Pull request is merged', { merged_at: pr.merged_at });
  if (requireMerged) return fail('merge_state', 'high', 'Contract requires the pull request to be merged; it is not merged yet', { state: pr.state });
  if (pr.state !== 'open') return fail('merge_state', 'high', 'Pull request was closed without merging', { state: pr.state });
  if (pr.draft) return fail('merge_state', 'medium', 'Pull request is still a draft', { draft: true });
  if (pr.mergeable === null) return warn('merge_state', 'GitHub is still computing mergeability', { mergeable: null });
  return pr.mergeable
    ? pass('merge_state', 'Pull request is open and mergeable', { mergeable: true })
    : fail('merge_state', 'medium', 'Pull request has merge conflicts', { mergeable: false });
}

async function ciResults(
  api: GithubApi,
  owner: string,
  repo: string,
  pr: GithubPull,
  required: string[],
  untrusted: UntrustedSource[],
): Promise<CheckResult[]> {
  let runs: GithubCheckRun[];
  let statuses: { context: string; state: string }[] = [];
  try {
    runs = await api.listCheckRuns(owner, repo, pr.head.sha);
  } catch (e) {
    return [errored('ci_checks', `Could not load CI check runs: ${(e as Error).message}`)];
  }
  try {
    statuses = (await api.getCombinedStatus(owner, repo, pr.head.sha)).statuses;
  } catch {
    // Legacy commit statuses are optional.
  }
  for (const r of runs) {
    if (r.output?.summary) untrusted.push({ label: `ci_output:${r.name}`, content: r.output.summary });
  }

  if (required.length > 0) {
    return required.map((name) => {
      const run = runs.find((r) => r.name.toLowerCase() === name.toLowerCase());
      const st = statuses.find((s) => s.context.toLowerCase() === name.toLowerCase());
      const ok = run ? run.status === 'completed' && run.conclusion === 'success' : st?.state === 'success';
      const state = run ? (run.conclusion ?? run.status) : (st?.state ?? 'missing');
      const evidence = { check: name, state, summary: run?.output?.summary ?? null };
      return ok
        ? pass(`required_check:${name}`, `Required CI check "${name}" succeeded`, evidence)
        : fail(`required_check:${name}`, 'high', `Required CI check "${name}" is ${state === 'missing' ? 'missing' : state}`, evidence);
    });
  }

  if (runs.length === 0 && statuses.length === 0) return [warn('ci_checks', 'No CI checks are configured on this pull request')];
  const bad = runs.filter((r) => r.status !== 'completed' || !['success', 'neutral', 'skipped'].includes(r.conclusion ?? ''));
  const badStatuses = statuses.filter((s) => s.state !== 'success');
  const evidence = { runs: runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion })) };
  return bad.length + badStatuses.length === 0
    ? [pass('ci_checks', `All ${runs.length + statuses.length} CI checks succeeded`, evidence)]
    : [fail('ci_checks', 'high', `${bad.length + badStatuses.length} CI check(s) are failing or incomplete`, evidence)];
}

async function loadFiles(
  api: GithubApi,
  ref: { owner: string; repo: string; number: number },
  checks: CheckResult[],
): Promise<GithubFile[] | null> {
  try {
    return await api.listPullFiles(ref.owner, ref.repo, ref.number);
  } catch (e) {
    checks.push(errored('changed_paths', `Could not load changed files: ${(e as Error).message}`));
    return null;
  }
}

function pathCheck(files: GithubFile[], expected: string[]): CheckResult {
  const adds = files.reduce((s, f) => s + f.additions, 0);
  const dels = files.reduce((s, f) => s + f.deletions, 0);
  const fileList = files.map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions }));
  if (files.length === 0) return fail('changed_paths', 'high', 'The pull request changes no files');
  if (expected.length === 0) return pass('changed_paths', `${files.length} file(s) changed (+${adds}/−${dels})`, { files: fileList });

  const missing = expected.filter((p) => !files.some((f) => globToRegExp(p).test(f.filename)));
  const outOfScope = files.filter((f) => !matchesAny(f.filename, expected)).map((f) => f.filename);
  if (missing.length > 0) {
    return fail('changed_paths', 'medium', `No changes found under the expected path(s): ${missing.join(', ')}`, {
      expected,
      missing,
      files: fileList,
    });
  }
  if (outOfScope.length > 0) {
    return warn('changed_paths', `${outOfScope.length} file(s) changed outside the expected paths`, { expected, outOfScope, files: fileList });
  }
  return pass('changed_paths', `All ${files.length} changed file(s) are within ${expected.join(', ')} (+${adds}/−${dels})`, {
    expected,
    files: fileList,
  });
}
