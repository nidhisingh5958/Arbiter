import * as cheerio from 'cheerio';
import type { UrlParams } from '@arbiter/shared';
import { AppError } from '../../lib/errors';
import type { UntrustedSource } from '../../llm/prompts';
import type { SiteFetcher } from './siteFetcher';
import { errored, fail, pass, warn, type CheckResult, type VerifierOutput } from './types';

const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px)?\b|opacity\s*:\s*0(?:\.0+)?\b/i;

/** URL/artifact verifier: reachability, host match, required text/selectors and a basic HTML sanity score. */
export async function verifyUrl(fetcher: SiteFetcher, params: UrlParams, submitted: string): Promise<VerifierOutput> {
  const checks: CheckResult[] = [];
  const untrusted: UntrustedSource[] = [];

  let url: URL;
  try {
    url = new URL(submitted);
  } catch {
    return { checks: [fail('url_format', 'critical', 'Submission is not a valid URL')], untrusted, facts: {} };
  }

  checks.push(url.protocol === 'https:' ? pass('https', 'Page is served over HTTPS') : warn('https', 'Page is served over plain HTTP'));

  if (params.url) {
    const expected = new URL(params.url);
    if (expected.hostname !== url.hostname) {
      checks.push(fail('host_matches', 'high', `Submitted URL is not on the contracted host ${expected.hostname}`, { expected: expected.hostname, actual: url.hostname }));
      return { checks, untrusted, facts: {} };
    }
    checks.push(pass('host_matches', `Submitted URL is on the contracted host ${expected.hostname}`));
    if (expected.pathname !== '/' && expected.pathname !== url.pathname) {
      checks.push(warn('path_matches', `Submitted path differs from the contracted path ${expected.pathname}`, { expected: expected.pathname, actual: url.pathname }));
    }
  }

  let page;
  try {
    page = await fetcher.fetch(url.toString(), params.maxResponseMs * 2);
  } catch (e) {
    if (e instanceof AppError && e.code === 'SSRF_BLOCKED') {
      checks.push(fail('ssrf_guard', 'critical', 'URL points to a private or internal network address and was not fetched', { reason: e.message }));
    } else {
      checks.push(errored('http_status', `Could not load the page: ${(e as Error).message}`));
    }
    return { checks, untrusted, facts: {} };
  }

  const facts = { status: page.status, elapsedMs: page.elapsedMs, bytes: page.bytes, redirects: page.redirects };
  if (page.status !== 200) {
    checks.push(fail('http_status', 'high', `Page returned HTTP ${page.status} (expected 200)`, facts));
    return { checks, untrusted, facts };
  }
  checks.push(pass('http_status', 'Page returned HTTP 200', facts));
  checks.push(
    page.elapsedMs <= params.maxResponseMs
      ? pass('response_time', `Responded in ${page.elapsedMs} ms (limit ${params.maxResponseMs} ms)`)
      : warn('response_time', `Responded in ${page.elapsedMs} ms, over the ${params.maxResponseMs} ms limit`),
  );
  if (page.contentType && !/html/i.test(page.contentType)) {
    checks.push(warn('content_type', `Response is not HTML (${page.contentType.split(';')[0]})`));
  }

  const $ = cheerio.load(page.body);
  const hiddenText: string[] = [];
  $('[hidden], [aria-hidden="true"], [style]').each((_, el) => {
    const node = $(el);
    const style = node.attr('style') ?? '';
    if (node.is('[hidden], [aria-hidden="true"]') || HIDDEN_STYLE.test(style)) {
      const t = node.text().trim();
      if (t) hiddenText.push(t);
      node.remove();
    }
  });
  const comments: string[] = [];
  $.root()
    .find('*')
    .contents()
    .each((_, node) => {
      if (node.type === 'comment' && 'data' in node && typeof node.data === 'string' && node.data.trim()) comments.push(node.data.trim());
    });
  const title = $('title').first().text().trim();
  $('script, style, noscript, template').remove();
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const lower = visibleText.toLowerCase();

  for (const text of params.requiredText) {
    checks.push(
      lower.includes(text.toLowerCase())
        ? pass(`required_text:${text}`, `Page contains "${text}"`)
        : fail(`required_text:${text}`, 'medium', `Page does not contain "${text}"`),
    );
  }
  for (const selector of params.requiredSelectors) {
    try {
      const count = $(selector).length;
      checks.push(
        count > 0
          ? pass(`required_selector:${selector}`, `Element ${selector} is present (${count})`)
          : fail(`required_selector:${selector}`, 'medium', `Element ${selector} is missing`),
      );
    } catch {
      checks.push(errored(`required_selector:${selector}`, `Selector ${selector} is not a valid CSS selector`));
    }
  }

  checks.push(htmlSanity($, title));

  untrusted.push({ label: 'page_title', content: title }, { label: 'page_visible_text', content: visibleText });
  if (hiddenText.length) untrusted.push({ label: 'page_hidden_text', content: hiddenText.join('\n') });
  if (comments.length) untrusted.push({ label: 'html_comments', content: comments.join('\n') });

  return { checks, untrusted, facts: { ...facts, hiddenTextBlocks: hiddenText.length, htmlComments: comments.length } };
}

function htmlSanity($: cheerio.CheerioAPI, title: string): CheckResult {
  const imgs = $('img');
  const withAlt = imgs.filter((_, el) => ($(el).attr('alt') ?? '').trim().length > 0).length;
  const parts = {
    title: title.length > 0 ? 25 : 0,
    viewport: $('meta[name="viewport"]').length > 0 ? 20 : 0,
    lang: ($('html').attr('lang') ?? '').length > 0 ? 15 : 0,
    h1: $('h1').length > 0 ? 15 : 0,
    imgAlt: imgs.length === 0 ? 25 : Math.round((withAlt / imgs.length) * 25),
  };
  const score = Object.values(parts).reduce((s, n) => s + n, 0);
  const evidence = { score, parts, images: imgs.length, imagesWithAlt: withAlt };
  return score >= 70
    ? pass('html_sanity', `Basic HTML/accessibility score ${score}/100`, evidence)
    : warn('html_sanity', `Basic HTML/accessibility score ${score}/100 (missing: ${Object.entries(parts)
        .filter(([, v]) => v === 0)
        .map(([k]) => k)
        .join(', ') || 'some image alt text'})`, evidence);
}
