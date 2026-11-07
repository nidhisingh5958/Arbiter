export interface GithubPull {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
  draft: boolean;
  html_url: string;
  user: { login: string };
  base: { ref: string; repo: { full_name: string } };
  head: { ref: string; sha: string };
  additions: number;
  deletions: number;
  changed_files: number;
  merged_at: string | null;
}

export interface GithubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GithubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  output?: { title?: string | null; summary?: string | null };
}

export interface GithubCombinedStatus {
  state: string;
  statuses: { context: string; state: string; description: string | null }[];
}

export interface GithubApi {
  getPull(owner: string, repo: string, number: number): Promise<GithubPull>;
  listPullFiles(owner: string, repo: string, number: number): Promise<GithubFile[]>;
  listCheckRuns(owner: string, repo: string, sha: string): Promise<GithubCheckRun[]>;
  getCombinedStatus(owner: string, repo: string, sha: string): Promise<GithubCombinedStatus>;
}

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}
