# Devpost submission: ArbiterAI

## Tagline

Escrow that checks the work before it pays: an AI agent that verifies milestones and releases PayPal payouts, with a tamper-evident evidence trail.

## Inspiration

Freelance developers in emerging markets (India, Nigeria, the Philippines) increasingly work for US and EU clients, but every milestone is a trust problem. Clients review late, "done" gets disputed because acceptance was never defined in a checkable way, and cross-border payouts add days. `TODO: cite source for one market statistic.` We wanted the payment itself to wait on *evidence* rather than on someone getting around to approving.

## What it does

- **SOW → milestones:** the buyer pastes a statement of work. An LLM (Groq) extracts milestones with testable acceptance criteria, amounts, deadlines and a verification method (GitHub PR, deployed URL or file). The buyer edits, and a strict schema ensures the amounts add up.
- **Per-milestone funding** with PayPal Orders v2 (sandbox): the buyer approves in PayPal checkout and funds are captured into the platform balance. This is clearly labeled a *sandbox escrow simulation*.
- **A verification agent** runs deterministic checks first (PR merged, base branch, required CI checks, changed paths; or HTTP 200, required text and selectors, HTML sanity). Then it scans for prompt injection, gets an LLM judgment with per-criterion evidence, and applies the policy engine.
- **Autonomous release:** the policy engine issues a single-use grant, and a tool-calling payments agent invokes `create_payout`. The contractor is paid with PayPal Payouts. Status arrives through signature-verified webhooks.
- **Disputes and human override**, refunds, and an early-release waiver.
- **AG Grid control room**: milestones grouped by contract with aggregates, an inspection log with expandable evidence, PayPal transactions, a hash-chained decision log, and webhooks, all updating live over SSE.

## How we built it

TypeScript monorepo: Fastify + Kysely (Postgres on Render, SQLite locally), React 19 + Vite + Tailwind v4, AG Grid Community, Framer Motion, GSAP (ScrollTrigger, SplitText), Lenis and boneyard-js. A typed PayPal REST client with a full offline simulator that sends signed webhooks. A Groq client with retries, timeouts, token and cost logging, and a deterministic mock so the whole project and its tests run without keys. One Docker image deployed with a Render Blueprint.

## AI tools used and how

- **Groq-hosted LLM** (configurable via `GROQ_MODEL`):
  1. Structured SOW extraction in JSON mode, validated with zod and retried with error feedback.
  2. Prompt-injection classifier over untrusted deliverable content.
  3. Deliverable judge producing a verdict, confidence and per-criterion evidence.
  4. Payments agent using OpenAI-style tool calling to choose `create_payout` or `hold_milestone`.
- **Guardrails:** the LLM never holds credentials, never chooses amounts or recipients, and can't move money without a policy-engine grant. Its output is advisory and schema-validated.
- **AI coding assistant:** Claude Code (Anthropic) was used to scaffold and implement the codebase, tests and docs under the author's direction.

## PayPal integration

Orders v2 (create, get, capture, authorize), Payments v2 (capture authorization, refund, void), Payouts v1 (create batch, get status) and Webhooks (`verify-webhook-signature` with the raw body). `PayPal-Request-Id` is sent on every mutating call, and handlers are idempotent by event ID. We checked the PayPal Agent Toolkit: it lacks Payouts and authorization capture, so we built an MCP-style tool layer, including a minimal MCP JSON-RPC endpoint, that keeps the policy engine in charge.

## Challenges

- Making "AI approves payment" safe: deterministic gates, injection defense, a policy engine with single-use grants, and server-side money parameters.
- Honest escrow: authorizations expire, so we documented the gap and the production path (multiparty delayed disbursement).
- Building row grouping and master/detail on AG Grid Community without Enterprise features.

## Accomplishments

- A working end-to-end flow on PayPal sandbox, with a full offline mode that mirrors it.
- A seeded prompt-injection PR that is caught live, with the payout blocked.
- A tamper-evident, DB-enforced append-only decision log with one-click chain verification.

## What we learned

LLMs are good at judging *evidence* but should never be the last word on *money*. Splitting deterministic gates, advisory AI judgment and a deterministic policy engine made the system both useful and defensible.

## What's next

- PayPal multiparty delayed disbursement and referenced payouts for real held funds.
- Sandboxed test execution (clone the PR and run the suite) in addition to CI status.
- Figma and design-review verifiers, multi-currency with FX quotes, and real auth with KYC.
- Contractor reputation built from the decision log.

## Built with

typescript · react · vite · tailwindcss · fastify · kysely · postgresql · sqlite · paypal-orders · paypal-payouts · paypal-webhooks · groq · ag-grid · framer-motion · gsap · lenis · boneyard-js · zod · vitest · docker · render
