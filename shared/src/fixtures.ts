/**
 * Demo fixture namespaces. GitHub PRs under `arbiterai-demo/*` and pages on the reserved
 * `.test` host below are resolved from local fixtures (never the network), so the demo is
 * deterministic in every mode. Everything else goes to the live APIs.
 */
export const DEMO_GITHUB_OWNER = 'arbiterai-demo';
export const DEMO_SITE_HOST = 'demo-fixtures.arbiterai.test';

export const DEMO_PRS = {
  happy: `https://github.com/${DEMO_GITHUB_OWNER}/storefront/pull/42`,
  failing: `https://github.com/${DEMO_GITHUB_OWNER}/storefront/pull/43`,
  injection: `https://github.com/${DEMO_GITHUB_OWNER}/storefront/pull/44`,
} as const;

export const DEMO_URLS = {
  happy: `https://${DEMO_SITE_HOST}/launch`,
  incomplete: `https://${DEMO_SITE_HOST}/launch-incomplete`,
  injection: `https://${DEMO_SITE_HOST}/launch-injection`,
  broken: `https://${DEMO_SITE_HOST}/launch-broken`,
} as const;

function isoDatePlusDays(days: number, from = new Date()): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** A realistic natural-language SOW used by the "Use sample" button and the mock extractor tests. */
export function sampleSow(now = new Date()): string {
  return `Statement of Work — Lumen Goods storefront refresh

Client: Lumen Goods (buyer, United States). Contractor: Ravi Menon (freelance engineer, India).
Total contract value: $1,400.00 USD, paid per milestone through ArbiterAI escrow.

Milestone 1 — Checkout page ($900, due ${isoDatePlusDays(14, now)})
Build a responsive checkout page in the GitHub repo ${DEMO_GITHUB_OWNER}/storefront.
Acceptance criteria:
- Pull request is merged into \`main\`.
- CI checks \`build\` and \`test\` must pass.
- Changes are limited to \`src/checkout/**\`.
- Cart totals include tax and are covered by unit tests.

Milestone 2 — Launch landing page ($500, due ${isoDatePlusDays(28, now)})
Deploy the launch landing page at ${DEMO_URLS.happy}.
Acceptance criteria:
- The page returns HTTP 200 over HTTPS.
- The page must contain "Lumen Goods" and "Free shipping".
- The page includes a newsletter form \`#signup-form\`.
- Basic accessibility: page title, viewport meta tag and alt text on images.
`;
}
