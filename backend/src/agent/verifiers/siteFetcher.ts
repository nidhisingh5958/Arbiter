import { AppError } from '../../lib/errors';
import { assertPublicHttpUrl } from '../../lib/ssrf';
import { SITE_FIXTURES, isFixtureUrl } from './siteFixtures';

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  elapsedMs: number;
  bytes: number;
  redirects: number;
}

export interface SiteFetcher {
  fetch(url: string, timeoutMs: number): Promise<FetchedPage>;
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

/**
 * Fetches deliverable URLs with SSRF protection on every hop, a timeout, a 2 MB body cap and
 * manual redirect handling. Demo fixture hosts are served from memory.
 */
export class GuardedSiteFetcher implements SiteFetcher {
  async fetch(rawUrl: string, timeoutMs: number): Promise<FetchedPage> {
    const started = Date.now();
    let current = new URL(rawUrl);

    if (isFixtureUrl(current)) {
      const f = SITE_FIXTURES[current.pathname] ?? { status: 404, body: '<html><body>Not found</body></html>' };
      return {
        finalUrl: current.toString(),
        status: f.status,
        contentType: 'text/html; charset=utf-8',
        body: f.body,
        elapsedMs: 40 + (f.delayMs ?? 0),
        bytes: Buffer.byteLength(f.body),
        redirects: 0,
      };
    }

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      await assertPublicHttpUrl(current.toString());
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'ArbiterAI-Verifier/1.0', Accept: 'text/html,application/xhtml+xml,*/*;q=0.5' },
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current);
        continue;
      }
      const { text, bytes } = await readLimited(res);
      return {
        finalUrl: current.toString(),
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        body: text,
        elapsedMs: Date.now() - started,
        bytes,
        redirects,
      };
    }
    throw new AppError(400, 'TOO_MANY_REDIRECTS', `More than ${MAX_REDIRECTS} redirects`);
  }
}

async function readLimited(res: Response): Promise<{ text: string; bytes: number }> {
  if (!res.body) return { text: '', bytes: 0 };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), bytes: total };
}
