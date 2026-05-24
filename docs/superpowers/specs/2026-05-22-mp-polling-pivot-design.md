# Design — Mercado Pago: pivot from webhook to polling

**Status:** Design ready for review.
**Date:** 2026-05-22
**Supersedes (partially):** [`2026-05-14-proactive-mercadopago-design.md`](./2026-05-14-proactive-mercadopago-design.md) — that doc designed an MP-driven push integration over webhooks. This doc replaces the webhook leg with a server-driven polling loop while reusing the same proactive-prompts, transactions, SSE and classifier infrastructure.
**Companion docs:** [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md), [CLAUDE.md](../../../CLAUDE.md)

---

## 1. Overview

Empirical testing of MP's webhook delivery showed that the `payment` topic only fires for movements created via integration products (Checkout API / Bricks / Subscriptions / Wallet Connect). Real-world activity that a personal-finance user expects to see — P2P transfers (Dinero en cuenta / CVU / alias), wallet funds from a bank, recurring subscriptions paid from MP, regular external payments at merchants — does **not** push a webhook to the connected app, even when the OAuth scope includes `payments read`.

Validation: `apps/api/scripts/search-mp-payments.ts` calls `GET /v1/payments/search` with the connected user's OAuth token and recovers all 13 movements over a 48h window (P2P, account_fund, recurring, regular) while `notifications_history` shows only 5 webhook deliveries (all of them initiated by our own dev preferences).

Conclusion: a server-driven poll against `/v1/payments/search` is the only way to capture the full picture. This document pivots the integration from "MP pushes us payments" to "we pull MP every 2 minutes". The user-facing proactive cards, the classifier, the SSE stream, the transactions store, and the OAuth flow all stay. The webhook receiver and its signature verifier go away.

---

## 2. Scope

**In scope**
- Delete the webhook controller, signature verifier, related schemas, and dev scripts that exist only to test the webhook path.
- Refactor `ProcessMpEvent` to accept a fully-hydrated `MpPayment` (the input shape changes from `{ paymentId, mpUserId }` to `{ payment, user }` because the caller already has the payment in hand from the polling search).
- Build a polling loop: a `@nestjs/schedule` cron firing every 2 minutes per connected user, calling `/v1/payments/search` with a per-user cursor, deduping by `mpPaymentId`, classifying, persisting, and publishing over SSE.
- Build a first-connect backfill: a modal at OAuth callback that lets the user pick how far back to import (24h / 7d / 15d / 30d / skip; default **skip**) and, when chosen, fetches that window, batch-classifies, auto-saves, and surfaces a single editable summary card in the chat thread.
- Add operation_type-aware copy to the proactive prompt card.
- Migrate existing transactions with `source: 'mp_webhook'` to `source: 'mercadopago'` so the enum collapses to a single value.

**Out of scope (explicit non-goals)**
- Manual user-facing "Refresh now" button — the 2-minute cron is the only poller. No cache, no in-flight semaphore, no client-side cooldown, no "Actualizado hace Xs" timestamp.
- Improving the classifier itself (e.g. adding semantic descriptions per category) — that lands as a separate feature that this pivot will benefit from automatically.
- Multi-user. v1 still has exactly one user (`default-user`); the polling loop iterates over `users` but in practice processes one.
- Real-time push from MP. Even where the webhook does fire, we no longer subscribe — polling is the single source.

---

## 3. PRODUCT.md amendments

This pivot does not introduce new amendments beyond what `2026-05-14-proactive-mercadopago-design.md` already established. The previous amendments still hold:

- Real bank integration is in-scope for Mercado Pago specifically.
- AI-initiated turns in an open session are allowed (SSE push while the chat is open).
- Single-user-for-now with a multi-tenant-ready data model.
- Transactions carry `direction` and `status` columns.

The only delta is mechanical: the channel by which MP movements reach the system flips from inbound HTTP to outbound HTTP. From the user's perspective, nothing changes — payments still appear as proactive cards in the chat, just with up to 2 minutes of latency instead of seconds.

---

## 4. Architecture overview

```
                              ┌────────────────────┐
                              │   Mercado Pago     │
                              └─────────┬──────────┘
                                        │  GET /v1/payments/search
                                        │  (every 2 min, per user)
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                       apps/api (NestJS :3001)                         │
 │                                                                       │
 │   @Cron('*/2 * * * *')  MpPollScheduler                              │
 │      └─► for each connected user:                                     │
 │            PollMpPayments use-case                                    │
 │              ├─► MpPaymentsSearchGateway  (paginated search)          │
 │              ├─► MpPollCursorsRepository  (lastPolledAt per user)     │
 │              ├─► RefreshMpToken           (if access token near exp)  │
 │              └─► for each new payment:                                │
 │                    ProcessMpEvent (refactored)                        │
 │                      ├─► dedupe via TransactionsRepository            │
 │                      ├─► HTTP ──► apps/ai /classify                   │
 │                      ├─► TransactionsRepo / PendingPromptsRepo        │
 │                      └─► ProactiveEventBus.publish()                  │
 │                                                                       │
 │   GET  /mp/oauth/start                                                │
 │   GET  /mp/oauth/callback ──► token exchange + redirect to /          │
 │                              with ?backfill=offer query string       │
 │   POST /mp/oauth/disconnect                                            │
 │   GET  /mp/oauth/status                                                │
 │                                                                       │
 │   POST /mp/backfill        ──► BackfillMpPayments use-case            │
 │                              (one-shot on user choice from modal)     │
 │                              returns BackfillSummary                  │
 │                                                                       │
 │   GET  /proactive/stream   ──► SSE (unchanged channel)                │
 │   GET  /proactive/pending  ──► list of unresolved + recent notices    │
 │   POST /proactive/:id/resolve                                         │
 │                                                                       │
 │   POST /classify                                                       │
 │                                                                       │
 └──────────────────────────────────────────────────────────────────────┘
                ▲                                       ▲
       HTTP /classify                              SSE + REST
                │                                       │
 ┌──────────────┴───────────────┐         ┌─────────────┴────────────────┐
 │   apps/ai (Mastra :4111)     │         │   apps/ui (Next.js :3000)    │
 │                              │         │                              │
 │  mp-classification/          │         │  /                            │
 │   workflows/classify-mp-     │         │   ├─ MercadoPagoChip          │
 │     event.ts                 │         │   ├─ ProactivePromptCard      │
 │   workflows/classify-batch.  │         │   │   (op_type-aware copy)   │
 │     ts (NEW)                 │         │   ├─ ProactiveNoticeCard     │
 │                              │         │   └─ BackfillSummaryCard     │
 │  agents/gasti                │         │      (NEW)                   │
 │                              │         │                              │
 │                              │         │  /mp/callback                 │
 │                              │         │   └─ BackfillModal (NEW)     │
 └──────────────────────────────┘         └──────────────────────────────┘
```

### Per-app responsibilities

- **`apps/api`** — owns the polling scheduler, OAuth flow (unchanged), token refresh, the polling cursors store, the backfill orchestrator, the dedupe boundary, the SSE endpoint, and the proactive REST routes. Pure HTTP + persistence + scheduling. No LLM logic.
- **`apps/ai`** — gains one new workflow `classifyBatchMpEvents` (input: array of MP payments; output: array of classifications) used by the backfill. The single-event `classifyMpEvent` workflow used by the cron remains unchanged.
- **`apps/ui`** — gains a `BackfillModal` shown on `/mp/callback` before redirecting to `/`, plus a `BackfillSummaryCard` rendered inline in the chat thread when a backfill completes. The existing `ProactivePromptCard` is extended with operation_type-aware lead copy.

---

## 5. Components to delete

These artifacts exist solely to support the inbound webhook path and are removed wholesale.

| Path | Reason |
|---|---|
| `apps/api/src/mp/interface/mp-webhook.controller.ts` | Webhook receiver. No callers after pivot. |
| `apps/api/src/mp/interface/mp-webhook.controller.test.ts` | Tests for the above. |
| `apps/api/src/mp/providers/mp-signature-verifier.ts` | Verifies the `x-signature` header on inbound webhook calls. No webhook → no verifier. |
| `apps/api/src/mp/providers/mp-signature-verifier.test.ts` | Tests for the above. |
| Webhook-specific Zod schemas in `apps/api/src/mp/interface/mp.schemas.ts` | The `MpWebhookBodySchema` (and any associated request/header schemas). Keep schemas used by OAuth and backfill endpoints. |
| `apps/api/scripts/create-mp-preference.ts` | Dev script that creates a Checkout Pro preference for the explicit purpose of triggering a webhook delivery. Useless after pivot. |
| Any `MP_WEBHOOK_SECRET` lookups in `apps/api/src/...config` | Env var is no longer read. Keep the value in `.env` until the pivot ships and is verified, then drop the line. |

The dev script `apps/api/scripts/search-mp-payments.ts` **stays** — it's the empirical probe that motivated this pivot and remains useful for debugging. It does not contain webhook-specific logic.

---

## 6. Components to refactor

| Path | Change |
|---|---|
| `apps/api/src/mp/use-cases/process-mp-event.use-case.ts` | Input shape changes from `{ paymentId: string; mpUserId: string }` to `{ payment: MpPayment; user: User }`. The caller (the new `PollMpPayments` use-case) already has both in hand from the search response, so re-fetching by ID would be wasteful and racy. Removes the dependency on `MP_PAYMENT_SOURCE` for `getById`. Branches 1–3 of the orchestration stay identical. Passes `user` through to `classifier.classify(...)` (see §10b). |
| `apps/api/src/mp/domain/payment-classifier.ts` | Extend the `PaymentClassifier.classify` input with `user: User`. Future-proofing for the per-user categories feature; the current `HttpPaymentClassifier` implementation does not read the field yet. See §10b. |
| `apps/api/src/mp/providers/http-payment-classifier.ts` | Accept `user` in the input. Body shape sent to `apps/ai` is unchanged for now. See §10b. |
| `apps/api/src/mp/mp.module.ts` | Remove `MpWebhookController`, `MpSignatureVerifier`. Add the new poll-side providers (see §7). |
| `apps/api/src/transactions/domain/transaction.ts` | The `source` enum collapses: drop `'mp_webhook'`, add `'mercadopago'`. Other values (`'manual'`, etc.) untouched. |
| `apps/api/data/transactions.json` | One-shot migration rewrites existing rows with `source: 'mp_webhook'` → `source: 'mercadopago'`. See §11. |
| `apps/api/src/proactive/use-cases/resolve-proactive-prompt.use-case.ts` | Where it currently passes `source: 'mp_webhook'` to `AddTransaction.execute`, replace with `source: 'mercadopago'`. |
| `apps/ui/src/proactive/components/proactive-prompt-card.tsx` | Replace the binary `lead = kind === 'income' ? 'Te llegó un pago' : 'Hiciste un pago'` with operation_type-aware copy. See §10. |
| `apps/api/.env` & `apps/api/.env.example` | Remove `MP_WEBHOOK_SECRET` and `MP_REDIRECT_URI`'s dependency on a public tunnel. OAuth callback can resolve to `http://localhost:3001/mp/oauth/callback` because MP accepts localhost redirects for personal apps; verify in OAuth panel. |

---

## 7. Components to create

### Backend (`apps/api`)

| Path | Responsibility |
|---|---|
| `apps/api/src/mp/domain/mp-payments-search.gateway.ts` | Interface (contract) for MP `/v1/payments/search`. Method: `search(input: { accessToken: string; beginDate: Date; endDate: Date; cursor?: { offset: number; limit: number } }) → Promise<{ results: MpPayment[]; paging: { total: number; offset: number; limit: number } }>`. |
| `apps/api/src/mp/providers/http-mp-payments-search.gateway.ts` | Concrete `fetch`-based implementation with structured logging on non-2xx. Loops pagination internally up to a safety cap of 500 results per call (callers can supply a stricter cap). |
| `apps/api/src/mp/domain/mp-poll-cursor.ts` | Entity: `{ userId: string; lastPolledAt: Date }`. Pure type + a couple of helpers (`advance`, `withInitialValue`). |
| `apps/api/src/mp/domain/mp-poll-cursors.repository.ts` | Interface. Methods: `getByUserId`, `upsert`. |
| `apps/api/src/mp/repositories/json-mp-poll-cursors.repository.ts` | Concrete impl, stores in `apps/api/data/mp-poll-cursors.json`. Atomic-write pattern matching the rest of the repo. |
| `apps/api/src/mp/use-cases/poll-mp-payments.use-case.ts` | Orchestrator (see §8). One user per call. |
| `apps/api/src/mp/use-cases/backfill-mp-payments.use-case.ts` | Orchestrator for the first-connect backfill (see §9). |
| `apps/api/src/mp/infrastructure/mp-poll.scheduler.ts` | `@Injectable()` with `@Cron('*/2 * * * *')`. Iterates connected users, calls `PollMpPayments` per user. Errors are caught per-user (one user's MP failure does not block another's). |
| `apps/api/src/mp/interface/mp-backfill.controller.ts` | Single endpoint `POST /mp/backfill` accepting `{ scope: '24h' \| '7d' \| '15d' \| '30d' }`. Returns the `BackfillSummary`. |
| `apps/api/src/proactive/domain/backfill-summary.ts` | Entity: `{ id, userId, range: { begin, end }, totalImported, byOperationType: Record<OperationType, number>, lowConfidenceCount, createdAt }`. |
| `apps/api/src/proactive/domain/backfill-summaries.repository.ts` | Interface. |
| `apps/api/src/proactive/repositories/json-backfill-summaries.repository.ts` | JSON impl, persisted at `apps/api/data/backfill-summaries.json`. |
| `apps/api/src/proactive/use-cases/publish-backfill-summary.use-case.ts` | Persists the summary and pushes it over SSE so the chat thread renders the card on next open. |
| `apps/ai/src/mp-classification/workflows/classify-batch.ts` | Mastra Workflow. Input: `{ payments: MpPayment[]; categories?: Category[] }` (Zod). Output: `Classification[]` aligned by index. Internally a single LLM call with the full list. Reuses the agent / model configuration of `classifyMpEvent`. The optional `categories` field is the future-proofing seam for the per-user categories feature (§10b) — when omitted, the workflow falls back to the agent's hardcoded category set. |

### Frontend (`apps/ui`)

| Path | Responsibility |
|---|---|
| `apps/ui/src/mp/components/backfill-modal.tsx` | Rendered on the `/mp/callback` route after a successful token exchange and before redirect to `/`. Pre-selects **skip**. On submit, hits `POST /mp/backfill` (or nothing if skip) and then navigates to `/`. |
| `apps/ui/src/proactive/components/backfill-summary-card.tsx` | Inline card in the chat thread. Shows `totalImported`, ranges, op_type breakdown. CTA "Ver detalle" expands an inline `BackfillDetailView` (next row) listing imported transactions grouped by category, with low-confidence items pinned to the top with a "Revisar" badge. |
| `apps/ui/src/proactive/components/backfill-detail-view.tsx` | The expanded view. Each row is editable: change category / description / delete. Saves through the existing edit endpoints on `transactions`. |
| `apps/ui/src/mp/infrastructure/http-mp-repository.ts` (additions) | Adds `triggerBackfill({ scope }: { scope: BackfillScope }): Promise<BackfillSummary>`. |
| `apps/ui/src/mp/infrastructure/use-mp-connection.ts` (additions) | After the callback resolves, expose `pendingBackfillOffer: boolean` so the modal is shown exactly once. Flag is cleared on submit or skip. |

---

## 8. Polling loop — happy path and rules

### Cursor

A per-user timestamp `lastPolledAt` stored in `apps/api/data/mp-poll-cursors.json`:

```jsonc
[
  { "userId": "default-user", "lastPolledAt": "2026-05-22T18:30:00.000Z" }
]
```

The cursor file lives next to `transactions.json`, `users.json`, etc. Stored separately from `users.json` because it churns every 2 minutes and would otherwise force constant rewrites of the more sensitive auth file.

### One tick of the cron

```
1. MpPollScheduler fires (every 2 min).
2. For each user U where U.mpUserId is set:
   2a. (try/catch boundary per user — one user's failure must not block others)
   2b. Call PollMpPayments.execute({ userId: U.id })
3. PollMpPayments:
    a. Load cursor for U; if missing, treat as lastPolledAt = now (no-op tick).
    b. If U.mpTokenExpiresAt is within 2 minutes of now → RefreshMpToken first.
    c. Compute window: begin = lastPolledAt - 5min, end = now.
    d. Call HttpMpPaymentsSearchGateway.search(...) paginated until paging.total
       drained, hard cap 500 results.
    e. Filter: drop operation_type === 'account_fund' (always).
    f. For each remaining payment:
         - if TransactionsRepository.findByMpPaymentId(U.id, payment.id) exists,
           skip (dedupe).
         - else hand to ProcessMpEvent.execute({ payment, user: U }).
    g. Persist cursor: lastPolledAt = end (i.e. now). Atomic write.
```

### Why the 5-minute backwards overlap

MP backdates payments. A payment created at T-3min may not appear in `/v1/payments/search` until T-1min, with `date_created: T-3min`. Without overlap, a cron at T-2min would not see it; the next cron at T+0 would query `begin=T-2min` and also miss it.

With `begin = lastPolledAt - 5min`, late-appearing payments are picked up on the very next tick. The dedupe step at 8.2.f prevents the overlap from generating duplicates: every payment is keyed by its globally-unique `mpPaymentId`.

### Errors

Cron is silent: failures are logged with structured fields (`userId`, `mpStatus`, `mpResponseBody.slice(0, 300)`) and re-attempted on the next tick. Rationale: the user has no recovery action available, and a transient 5xx from MP that resolves within 4 minutes should not show as an alarm banner. If MP is down for hours, the user will notice via absent payments, not via a UI indicator (acceptable for v1).

The error boundary is **per user** inside the scheduler. One user's `await PollMpPayments` rejection must not bubble out of the loop. The scheduler logs the rejection and continues to the next user.

### Token refresh

`RefreshMpToken` already exists for the webhook path. The cron's pre-flight check uses `isMpTokenExpired(user, skewMs = 2 * 60_000)`. If a `/v1/payments/search` call returns 401 mid-poll, refresh once and retry the same call exactly once. If the retry also returns 401, log and mark the user as needing reconnection (`U.mpTokenExpiresAt = null` semantic; do **not** drop the encrypted tokens — the user may still recover via re-OAuth from the chip).

### Concurrency

The scheduler is a single in-process cron. There is no second poller, no manual refresh endpoint, no SSE-driven trigger. Therefore: no in-flight semaphore, no cache, no race between competing pollers. If a 2-minute tick takes longer than 2 minutes (highly unlikely for a single user), `@nestjs/schedule` queues the next invocation; we accept the rare overlap because dedupe protects correctness.

---

## 9. Backfill — first-connect flow

### Trigger

OAuth callback at `GET /mp/oauth/callback` completes the token exchange and **redirects to `/mp/callback`** (a client route in `apps/ui`) with a query parameter signaling first-connect status. The client route mounts the `BackfillModal`, blocks rendering the rest of the app behind it until the user picks a scope or skips, then redirects to `/`.

This guarantees the decision is taken before the chat opens, so the summary card (when applicable) is the first message in the thread.

### Modal UX

- Title: "¿Importamos tus pagos recientes?"
- Options as a single-select pill stack matching `DESIGN.md`:
  - **Skip** (default, pre-selected) — "No, arrancamos limpio"
  - 24h — "Últimas 24 horas"
  - 7d — "Última semana"
  - 15d — "Últimos 15 días"
  - 30d — "Último mes"
- Primary button: **Continuar** (always enabled because skip is valid).
- On skip → `lastPolledAt = now` for the user, modal closes, redirect to `/`. No backfill, no card.
- On scope X → `POST /mp/backfill { scope: X }`. Modal switches to a progress state (indeterminate bar + "Trayendo tus pagos de los últimos N días…"). Resolves into the redirect to `/` once the use-case returns.

### `BackfillMpPayments` use-case (server)

```
Input:  { userId: string; scope: '24h' | '7d' | '15d' | '30d' }
Output: BackfillSummary (also published over SSE for the chat thread)

Steps:
  1. Resolve user. Refresh token if expiring soon.
  2. Compute window: end = now, begin = end - scopeDuration.
  3. Call HttpMpPaymentsSearchGateway.search(...) paginated, drain to paging.total
     or hit the safety cap of 500.
  4. Filter: drop operation_type === 'account_fund'.
  5. Dedupe: drop any payment whose mpPaymentId already exists in transactions
     (defensive — the user could have manually added it pre-backfill).
  6. Batch-classify via apps/ai POST /classify-batch (one HTTP call, one LLM call).
  7. For each (payment, classification):
       - Build the Transaction row directly (no PendingPrompt — backfill auto-saves).
       - status: 'active'; source: 'mercadopago'; direction derived from
         collector_id === Number(user.mpUserId).
       - If classification.confidence < 0.4 → category = 'otros',
         lowConfidence flag persisted on the transaction (existing column or
         add a boolean `needsReview` to the transaction row).
       - INSERT into TransactionsRepository (which enforces the mpPaymentId
         uniqueness check).
  8. Build BackfillSummary { totalImported, byOperationType,
     lowConfidenceCount, range }, persist via BackfillSummariesRepository.
  9. PublishBackfillSummary → SSE.
  10. Persist cursor: lastPolledAt = end.
  11. Return the summary to the caller.
```

### Summary card UX (in chat thread)

The `BackfillSummaryCard` renders as a normal proactive card style (frosted bg, eyebrow "Gasti") but with a different intent — it is a fait accompli, not a confirmation. Body:

> Importé **78 movimientos** de los últimos 30 días.
>
> · 42 pagos a comercios · 23 transferencias · 8 pagos recurrentes
> · **5 quedaron en "otros" para que los revises**

Two pills: **Ver detalle** (expands the detail view) and **Cerrar** (closes the card permanently — server-side flag on the summary).

The detail view lists imported transactions grouped by category, with low-confidence items pinned to the top and a "Revisar" badge. Each row is editable inline (category dropdown, description text). Saves go through the existing transaction edit endpoint.

### Why batch instead of per-item classification

A 30-day backfill is typically 40–80 payments. Per-item:
- ~80 sequential or rate-limited LLM calls, ~30–60s wall time, ~80× cost.
- Each call sees only one payment in isolation.

Batch:
- One call, ~3–5s wall time, ~1× cost.
- The model can recognize patterns across items (three Uber payments → all transporte) and produce more consistent categorization.

The batch workflow lives in `apps/ai` because it is LLM orchestration; the rules of `CLAUDE.md` forbid building bespoke LLM glue in `apps/api`. The Mastra Workflow signature: `inputSchema: z.array(MpPaymentSchema)`, `outputSchema: z.array(ClassificationSchema)`, alignment by index.

---

## 10. Operation_type-aware copy

The `ProactivePromptCard` lead copy uses operation_type + direction to pick from this table:

| operation_type | direction | lead copy | counterpart |
|---|---|---|---|
| `regular_payment` | income | "Te llegaron" | payer name or email |
| `regular_payment` | expense | "Pagaste" | merchant from `additional_info.items[0].title` ?? `description` |
| `money_transfer` | income | "Te transfirieron" | payer name or email |
| `money_transfer` | expense | "Transferiste" | recipient (best-effort from MP shape) |
| `recurring_payment` | income | (rare in practice — keep "Te llegaron") | payer |
| `recurring_payment` | expense | "Pago recurrente de" | merchant |
| `account_fund` | * | n/a (filtered out, never surfaced) | — |

Implementation: a small pure function `pickLeadCopy({ operationType, direction, merchant, payer }): { lead, counterpart, direction }` lives in `apps/ui/src/proactive/providers/`. The card consumes it directly. Pure function, no DI needed, unit-testable.

The `PendingPrompt` domain needs a new field `operationType: 'regular_payment' | 'money_transfer' | 'recurring_payment'`. The `ProcessMpEvent` use-case sets it when creating the prompt; for legacy prompts (rows already in `pending-prompts.json` from the webhook era), default to `'regular_payment'` in a one-line migration step alongside the source-rename migration.

---

## 10b. Classifier contract evolution

This pivot does not change the classifier itself, but it **future-proofs the interface** so the in-flight feature *"categorías personalizadas con descripción semántica"* (a separate, parallel work stream owned by the user) can plug in cleanly when it lands — without forcing a second breaking-change pass through every call site.

### Current state (static)

- The Mastra agent `mp-classifier` carries the 7 categories hardcoded in its `instructions` block (`apps/ai/src/mp-classification/agents/mp-classifier.agent.ts:13-20`).
- The output schema is a fixed `z.enum` of those 7 values (`apps/ai/src/mp-classification/domain/classification.ts:12-18`).
- The `PaymentClassifier` interface in `apps/api` (`apps/api/src/mp/domain/payment-classifier.ts`) takes only the payment shape: `{ kind, amount, merchant, description, counterparty }`. No user context.

### What changes when categories become per-user (separate feature)

Three things move from static to dynamic. They all live in the `apps/ai` side and the boundary between apps:

1. **The prompt becomes dynamic.** The `buildPrompt` step in `classify-mp-event.workflow.ts` (and the new `classify-batch.workflow.ts` introduced by this pivot) prepends the user's category list with each category's description before the payment data:

   ```
   Categorías disponibles:
   - food: restaurantes, delivery, supermercados, almacenes
   - transporte: Uber, Cabify, SUBE, peajes, estacionamiento
   - [custom_tag]: <descripción que el usuario configuró>
   ...
   ```

   The agent's `instructions` block collapses to a generic "pick exactly one category from the list provided in the user message; report a confidence 0..1; do not invent categories not in the list".

2. **The output schema becomes flexible.** `categorySchema` can no longer be a hard-coded `z.enum`. Likely path:

   ```ts
   z.string().refine(v => allowedNames.includes(v), { message: 'unknown category' })
   ```

   where `allowedNames` is computed per-request from the inbound payload. Structured-output binding (`toStandardSchema(classificationSchema)`) stays the same.

3. **The classifier contract in `apps/api` gains `user`.** `PaymentClassifier.classify(input)` evolves from `{ kind, amount, merchant, description, counterparty }` to `{ user, kind, amount, merchant, description, counterparty }`. The HTTP implementation (`http-payment-classifier.ts`) reads the user's categories from a local `CategoriesRepository` (owned by `apps/api`) and serializes them into the POST body to `apps/ai`.

### What this pivot does *today* to future-proof

To avoid a second wave of breaking-change refactors when the categories feature lands, this pivot threads `user` through every classifier call path **now**, even though the current implementation ignores the new field:

| Touchpoint | What this pivot does |
|---|---|
| `PaymentClassifier` interface (`apps/api/src/mp/domain/payment-classifier.ts`) | Extend the input type with `user: User`. Field is required at the type level; current impl simply does not read it. |
| `HttpPaymentClassifier` (`apps/api/src/mp/providers/http-payment-classifier.ts`) | Accepts `user` in the input but does not send it to `apps/ai` yet. Stays functionally identical. |
| `ProcessMpEvent` (refactored per §6) | New signature `{ payment, user }` already carries `user`. Pass it straight through: `classifier.classify({ user, ...paymentFields })`. |
| `PollMpPayments` (new, §8) | `user` is loaded at step 2a. Pass it through `ProcessMpEvent`. |
| `BackfillMpPayments` (new, §9) | `user` is loaded at step 1. Pass it to the batch classifier path. |
| `classify-batch.workflow.ts` (new, §7) | Workflow input schema includes a placeholder field `categories: z.array(...).optional()`. When omitted, the workflow uses the current hardcoded set. When present, it switches to the dynamic prompt. |

When the categories feature ships, the only changes needed are:

- `HttpPaymentClassifier` starts reading the user's categories from the new `CategoriesRepository` (its new constructor dep) and including them in the POST body.
- The Mastra workflows' `buildPrompt` step starts consuming `categories` from the input.
- `classificationSchema` switches from `z.enum` to the refined-string approach.

**No call site of `classifier.classify(...)` needs to change** — the contract evolution is invisible to the polling pivot. The plumbing is already there.

### Why "data goes to the agent" and not the reverse (Camino A)

There are two architectural ways to give `apps/ai` access to the user's categories:

- **Camino A (chosen):** `apps/api` reads categories from its own `CategoriesRepository` and ships them in the request body to `apps/ai`. One round-trip. `apps/ai` is stateless about user data.
- **Camino B (rejected):** `apps/api` sends only `userId`; `apps/ai` calls back into `apps/api` to fetch categories. Two round-trips. `apps/ai` needs auth, a client, and knowledge of `apps/api`'s API.

Camino A is consistent with the Clean Architecture rules in `CLAUDE.md` — `apps/ai` is the LLM orchestration layer and must not reach into `apps/api`'s persistence (that would invert the dependency direction). `apps/api` owns the data and serializes it at the cross-app boundary; `apps/ai` consumes only what each request hands it.

### Open question deferred to the categories feature

How the user's category overrides interact with the **merchant-level overrides** that already exist (`OverrideMerchantCategory` use-case): if a merchant is mapped to a category that the user later deletes, that override needs migration. This is out of scope for the polling pivot; recorded here so the categories-feature spec picks it up.

---

## 11. Migration of legacy data

A single one-shot script `apps/api/scripts/migrate-mp-source.ts` runs once after the pivot deploys:

```
For each transaction T in transactions.json:
  if T.source === 'mp_webhook':
    T.source = 'mercadopago'

For each prompt P in pending-prompts.json:
  if P.operationType is missing:
    P.operationType = 'regular_payment'  (best-effort default)

Atomic write back.
```

Script is idempotent: re-runs are no-ops. Tests for the script live next to it (`migrate-mp-source.test.ts`) using a temp fixture. The script does **not** run automatically at boot — it is invoked manually once after deploy. Rationale: avoids a startup side-effect that would be confusing in a chained deploy / rollback scenario.

`source: 'mp_webhook'` is removed from the TypeScript union after the script runs and the snapshot of data is verified. The type system then enforces that nothing in the codebase can recreate it.

---

## 12. Edge cases and decisions

| Case | Behavior |
|---|---|
| User has not connected MP | Scheduler skips them. No cursor row created. |
| User disconnects mid-poll | The poll loop holds a snapshot of the user from step 2 of §8. If disconnect happens during the in-flight HTTP call, the call completes against the now-revoked token (likely 401 → refresh → 401 → mark for reconnect). Acceptable. |
| MP returns 0 results | Cursor advances to `end`, otherwise no-op. No SSE traffic. |
| Backfill scope produces > 500 results | Cap at 500 with a `truncated: true` field on the summary. UI displays a hint: "Mostramos los 500 más recientes; movimientos más antiguos no se importaron." |
| User triggers OAuth twice without disconnecting (re-auth) | OAuth callback overwrites the token. The modal is shown only if the user has no `lastPolledAt` set; otherwise the user is already a returning user and we skip the modal. |
| Two payments with the same `mpPaymentId` returned in the same page (shouldn't happen — MP IDs are globally unique) | Repo dedupe still catches it. Log a warning. |
| Payment with `operation_type` value not in our enum (`null` / new value MP added) | Treat as `regular_payment` and log the unexpected value. Do not drop. |
| `paging.total` is unreliable (MP sometimes returns lower than actual) | Gateway loops by `offset += limit` until `results.length < limit` regardless of `paging.total`. Hard cap on iterations also protects from infinite loops. |
| Classifier service (`apps/ai`) is down at poll time | `ProcessMpEvent` propagates the error; per-user try/catch in the scheduler logs and moves on. Next tick retries — the payment is still in MP, our cursor has **not** advanced for failed payments (advance happens only on success of the whole tick), so we will see it again. |
| Cursor is corrupt / file deleted | Repo treats absence as `lastPolledAt = now` (graceful default) and writes a fresh row. Loses backfill replay opportunity but does not crash. |

### Cursor advance — atomicity

The cursor advances only **after** all payments in the window have been processed without throwing. If any single `ProcessMpEvent` throws, the cursor for that tick does not advance — the next tick re-fetches the same window, dedupe protects already-saved rows, and the failed payment gets another shot. This makes the loop self-healing for transient failures without requiring a dead-letter queue.

---

## 13. Testing strategy

Per the project memory ("apps/api ships tests"), the new use-cases get bun:test coverage.

| Module | Tests |
|---|---|
| `PollMpPayments` | window math (begin/end, overlap), filter (account_fund dropped), dedupe (no duplicate insert when mpPaymentId exists), cursor advance on success only, cursor non-advance on per-payment failure. |
| `BackfillMpPayments` | scope → date math, pagination loop, cap at 500, batch classifier called once, summary built correctly, transactions written with `source: 'mercadopago'`, low-confidence items routed to `otros` with `needsReview`. |
| `HttpMpPaymentsSearchGateway` | URL construction, pagination loop, 401 path (one refresh + retry), 5xx logs + throws. Mocked `fetch`. |
| `JsonMpPollCursorsRepository` | upsert / getByUserId, atomic write. |
| `migrate-mp-source` script | idempotent across reruns; correctly renames `mp_webhook` → `mercadopago`; default `operationType` on prompts. |
| `pickLeadCopy` pure fn | All cells of the table in §10. |

Two follow-up tasks already exist in the task tracker (#13, #14); this work satisfies #13 for the new use-cases.

---

## 14. Open questions

1. **Where does `MpPollScheduler` live in the boot sequence?** — Likely registered in `mp.module.ts` alongside the other MP providers. Confirm `@nestjs/schedule`'s `ScheduleModule.forRoot()` is wired in `app.module.ts`.
2. **Should `needsReview` be a column on `Transaction` or a flag on a separate review queue?** — Spec assumes a column. If the columns explode, consider a sidecar table. For v1, the column is cheaper.
3. **Does the backfill modal need an "Importar más tarde" option?** — Spec says no (skip is "no" once and forever per current decision). If user feedback later shows this is too rigid, expose it as a setting then.
4. **Recurring payments and the `recurring_payment` operation_type — do they need a separate budget category in UI?** — Out of scope. They register as regular transactions with their natural category (e.g. Uber → transporte). The lead copy ("Pago recurrente de") is the only differentiation.

---

## 15. Implementation phases (handoff to `writing-plans`)

The plan should sequence these batches, each independently testable:

1. **Boot prep** — install `@nestjs/schedule` if missing; verify it; add `ScheduleModule.forRoot()` to `app.module.ts`.
2. **Domain + repo for cursors** — `MpPollCursor`, repository interface, JSON impl, tests.
3. **Search gateway** — interface + HTTP impl, paging tests with `fetch` mock.
4. **Refactor `ProcessMpEvent`** — new signature, tests updated. Keep all branch 1/2/3 logic.
5. **`PollMpPayments` use-case + tests.**
6. **`MpPollScheduler` + module wiring.** Smoke-verify with a 30-second test cadence in dev.
7. **`classifyBatchMpEvents` workflow** in `apps/ai` + HTTP exposure on `/classify-batch`.
8. **`BackfillMpPayments` use-case + tests.**
9. **`BackfillSummary` domain + repo + `PublishBackfillSummary` use-case.**
10. **`POST /mp/backfill` controller.**
11. **UI: `BackfillModal` + `/mp/callback` route + `useMpConnection` additions.**
12. **UI: `BackfillSummaryCard` + `BackfillDetailView`.**
13. **UI: `ProactivePromptCard` lead copy refactor + `pickLeadCopy` pure fn + tests.**
14. **Delete webhook artifacts** (§5). Verify build / type-check / tests pass.
15. **Run `migrate-mp-source` script** against current data. Verify diff in transactions.json.
16. **End-to-end manual verification** with a real connected account and a small set of test payments. Verify the cron picks them up within 2 minutes. Verify a 7d backfill imports correctly and the summary card is editable.

---

End of design.
