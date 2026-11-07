# ArbiterAI: plan, decisions and deviations

**Goal:** a working end-to-end prototype of AI-verified milestone escrow on the PayPal sandbox, runnable locally with zero keys and deployable to Render.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Layout | npm workspaces `backend/`, `frontend/`, `shared/` | Requested folder names; shared zod schemas and the state machine are used by both sides |
| API | Fastify 5 with encapsulated route plugins | Raw-body webhook scope, rate limits, Helmet, clean plugin boundaries |
| DB | Kysely over SQLite (better-sqlite3) or Postgres (pg) | One typed query layer for both dialects. Portable schema: text ids, ISO timestamps, integer cents |
| LLM | **Groq** (OpenAI-compatible) via `GROQ_MODEL`, never hard-coded; deterministic mock | Requested by the owner. JSON mode plus tool calling |
| PayPal | Hand-written typed REST client plus an in-memory simulator | Full control over `PayPal-Request-Id`, raw-body webhook verification, Payouts |
| Agent tools | MCP-style tool gateway plus a minimal MCP JSON-RPC endpoint | `@paypal/agent-toolkit` (v1.11.0, checked 2026-11-07) has no Payouts or authorization-capture tools |
| Realtime | SSE on a single origin | Simple and reliable on Render; drives grid row flashes |
| Grid | AG Grid **Community** | Grouping and master/detail rebuilt from Community primitives, so no license key or watermark |
| Hosting | One Docker web service serving API + SPA, plus Render Postgres | Same origin for SSE, PayPal return URLs and webhooks |

## Deviations from the original brief

- **Anthropic → Groq.** `ANTHROPIC_MODEL` becomes `GROQ_MODEL`. Mock mode (`LLM_MODE=mock`) is unchanged.
- **`apps/api`, `apps/web`, `packages/shared` → `backend/`, `frontend/`, `shared/`.**
- **Orders are created when the buyer clicks Fund** on the active milestone, not the instant it activates. This avoids orphaned and expired orders, and repeat clicks reuse the open order.
- **Extra statuses and tables:** `REFUNDED` (milestone closed with funds returned), `disputes`, and `release_grants` (single-use policy grants).
- **The frontend has no unit tests.** The backend tests cover the money paths. A Playwright smoke test is not included.
- **The GitHub verifier relies on CI status** instead of cloning and running tests in a container.

## Phase status

Phases 0–8 are implemented. Tests and typecheck run in CI (`.github/workflows/ci.yml`). Remaining owner tasks: create the sandbox, Groq and Render accounts, fill in `.env`, deploy, record the video, and fill the `TODO: cite source` and URL placeholders.
