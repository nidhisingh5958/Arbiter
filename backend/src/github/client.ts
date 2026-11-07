import { DEMO_GITHUB_OWNER } from '@arbiter/shared';
import type { AppConfig } from '../config/env';
import { PR_FIXTURES } from './fixtures';
import {
  GithubApiError,
  type GithubApi,
  type GithubCheckRun,
  type GithubCombinedStatus,
  type GithubFile,
  type GithubPull,
} from './types';

const API = 'https://api.github.com';

class LiveGithubApi implements GithubApi {
  constructor(private readonly token: string | null) {}

  private async get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ArbiterAI-Verifier',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const hint = res.status === 403 && remaining === '0' ? ' (GitHub rate limit reached — set GITHUB_TOKEN)' : '';
      throw new GithubApiError(res.status, `GitHub API ${res.status} for ${path}${hint}`);
    }
    return (await res.json()) as T;
  }

  getPull(owner: string, repo: string, n: number) {
    return this.get<GithubPull>(`/repos/${owner}/${repo}/pulls/${n}`);
  }

  async listPullFiles(owner: string, repo: string, n: number) {
    const all: GithubFile[] = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await this.get<GithubFile[]>(`/repos/${owner}/${repo}/pulls/${n}/files?per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  async listCheckRuns(owner: string, repo: string, sha: string) {
    const res = await this.get<{ check_runs: GithubCheckRun[] }>(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`);
    return res.check_runs;
  }

  getCombinedStatus(owner: string, repo: string, sha: string) {
    return this.get<GithubCombinedStatus>(`/repos/${owner}/${repo}/commits/${sha}/status`);
  }
}

class FixtureGithubApi implements GithubApi {
  private fixture(owner: string, repo: string, n: number) {
    const f = PR_FIXTURES[`${owner}/${repo}#${n}`];
    if (!f) throw new GithubApiError(404, `Pull request ${owner}/${repo}#${n} not found in demo fixtures`);
    return f;
  }
  async getPull(owner: string, repo: string, n: number) {
    return structuredClone(this.fixture(owner, repo, n).pull);
  }
  async listPullFiles(owner: string, repo: string, n: number) {
    return structuredClone(this.fixture(owner, repo, n).files);
  }
  async listCheckRuns(owner: string, repo: string, sha: string) {
    const f = Object.values(PR_FIXTURES).find((x) => x.pull.head.sha === sha && x.pull.base.repo.full_name === `${owner}/${repo}`);
    return structuredClone(f?.checkRuns ?? []);
  }
  async getCombinedStatus(): Promise<GithubCombinedStatus> {
    return { state: 'pending', statuses: [] };
  }
}

class DisabledGithubApi implements GithubApi {
  private error(): GithubApiError {
    return new GithubApiError(
      503,
      `GITHUB_MODE=mock: only ${DEMO_GITHUB_OWNER}/* demo fixtures are available. Set GITHUB_MODE=live to verify real pull requests.`,
    );
  }
  getPull(): Promise<GithubPull> {
    return Promise.reject(this.error());
  }
  listPullFiles(): Promise<GithubFile[]> {
    return Promise.reject(this.error());
  }
  listCheckRuns(): Promise<GithubCheckRun[]> {
    return Promise.reject(this.error());
  }
  getCombinedStatus(): Promise<GithubCombinedStatus> {
    return Promise.reject(this.error());
  }
}

/** Routes demo-owner repos to fixtures and everything else to live GitHub (or a clear error in mock mode). */
export class GithubRouter implements GithubApi {
  private readonly fixtures = new FixtureGithubApi();
  private readonly live: GithubApi;

  constructor(cfg: AppConfig['github']) {
    this.live = cfg.mode === 'live' ? new LiveGithubApi(cfg.token) : new DisabledGithubApi();
  }

  private pick(owner: string): GithubApi {
    return owner.toLowerCase() === DEMO_GITHUB_OWNER ? this.fixtures : this.live;
  }
  getPull(owner: string, repo: string, n: number) {
    return this.pick(owner).getPull(owner, repo, n);
  }
  listPullFiles(owner: string, repo: string, n: number) {
    return this.pick(owner).listPullFiles(owner, repo, n);
  }
  listCheckRuns(owner: string, repo: string, sha: string) {
    return this.pick(owner).listCheckRuns(owner, repo, sha);
  }
  getCombinedStatus(owner: string, repo: string, sha: string) {
    return this.pick(owner).getCombinedStatus(owner, repo, sha);
  }
}
