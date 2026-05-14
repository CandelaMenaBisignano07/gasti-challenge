# Design — Proactive Mercado Pago prompts

**Status:** Design approved, ready for implementation plan.
**Date:** 2026-05-14
**Companion docs:** [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md), [CLAUDE.md](../../../CLAUDE.md)

---

## 1. Overview

Make Gasti **proactive**: when a Mercado Pago payment settles (incoming or outgoing), surface an in-chat card from Gasti with the proposed transaction (already classified) and pills to `Agregar` / `Editar` / `Descartar`. When MP later reverses a settled payment, update the existing transaction's status and surface a read-only notice in the chat thread — no agent involvement.

The integration is **real** (live MP webhook via ngrok, OAuth via MP Connect, token persistence) and the data model is **multi-tenant-ready** even though v1 has exactly one user.

---

## 2. PRODUCT.md amendments

This feature requires three explicit amendments to `PRODUCT.md`. They are recorded here so the trade-offs are visible:

1. **Real bank integration is in-scope for Mercado Pago specifically.** PRODUCT.md says "Real bank integrations. No Plaid, no OFX, no CSV upload, no screen-scraping." MP is now an exception: real OAuth, real API, real webhooks. Other integrations remain out.

2. **AI-initiated turns in an open session are allowed.** PRODUCT.md says "Gasti only speaks when the user opens the chat. No background channels." We interpret an in-chat card pushed via SSE *while the user has the chat open* as the agent taking a turn, not a background channel. Webhooks fired while the UI is closed are persisted server-side and surfaced inside the chat thread on next open — still not a push notification.

3. **The single-user, no-login constraint relaxes to single-user-for-now with a multi-tenant-ready data model and a real OAuth Connect flow.** PRODUCT.md says "No multi-user, accounts, auth, login." We build the OAuth machinery (Connect → authorization → token exchange → refresh) and a `users` table that scopes every entity by `user_id`, but v1 seeds exactly one user (`default-user`).

4. **Transactions gain `direction` and `status`.** PRODUCT.md defines the transactions schema as `id, date, amount (positive ARS), currency, category, description, merchant`. We add three columns: `direction: 'expense' | 'income'`, `status: 'active' | 'refunded' | 'charged_back'`, `mp_payment_id`. Incoming MP payments are now real rows in `transactions` (not working-memory income statements) with `direction='income'`. Reversals are status mutations on the original row, never counter-entries.

---

## 3. Architecture overview

```
                              ┌────────────────────┐
                              │   Mercado Pago     │
                              └─────────┬──────────┘
                                        │ webhook (payment.created/updated)
                                        ▼
                              ┌────────────────────┐
                              │   ngrok tunnel     │
                              └─────────┬──────────┘
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                       apps/api (NestJS :3001)                         │
 │                                                                       │
 │   POST /mp/webhook        ──► MpWebhookController                     │
 │                              └─► ProcessMpEvent use-case              │
 │                                  ├─► MercadoPagoProvider              │
 │                                  ├─► HTTP ──► apps/ai /classify       │
 │                                  ├─► TransactionsRepo / PendingRepo   │
 │                                  └─► ProactiveEventBus.publish()      │
 │   GET  /mp/oauth/start    ──► redirect to MP authorization URL        │
 │   GET  /mp/oauth/callback ──► token exchange, LinkMpAccount           │
 │   POST /mp/oauth/disconnect                                            │
 │   GET  /mp/oauth/status                                                │
 │                                                                       │
 │   GET  /proactive/stream    ──► SSE (subscribes to bus per user)      │
 │   GET  /proactive/pending   ──► list of unresolved + recent notices   │
 │   POST /proactive/:id/resolve ──► AddTransaction or DismissPrompt     │
 │                                                                       │
 └──────────────────────────────────────────────────────────────────────┘
                ▲                                       ▲
       HTTP /classify                              SSE + REST
                │                                       │
 ┌──────────────┴───────────────┐         ┌─────────────┴────────────────┐
 │   apps/ai (Mastra :4111)     │         │   apps/ui (Next.js :3000)    │
 │                              │         │                              │
 │  mp-classification/          │         │  app/chat/page.tsx           │
 │   workflows/classify-mp-     │         │   ├─ useProactivePrompts()   │
 │     event.ts (Workflow)      │         │   ├─ useMpConnection()       │
 │     step: detect-kind        │         │   ├─ <Composer/>             │
 │     step: pick-category      │         │   │   └ <MercadoPagoChip/>   │
 │     step: draft-description  │         │   ├─ <ProactivePromptCard/>  │
 │                              │         │   └─ <ProactiveNoticeCard/>  │
 │  agents/gasti (chat agent)   │         │                              │
 │                              │         │                              │
 └──────────────────────────────┘         └──────────────────────────────┘
```

### Per-app responsibilities

- **`apps/api`** — owns the MP webhook receiver, OAuth flow, token storage (AES-256-GCM encrypted), the `users` / `pending_prompts` / `transactions` SQLite store, the SSE endpoint, and all REST routes the UI talks to. Pure HTTP + persistence layer. No LLM.
- **`apps/ai`** — owns one `classifyMpEvent` Mastra Workflow (three steps: detect kind → pick category → draft description) exposed over Mastra's built-in HTTP server. The chat agent already lives here. Strict Mastra primitives.
- **`apps/ui`** — chat surface (Next.js App Router). Renders proactive cards inline in the thread. The composer carries a chip row (ChatGPT-style) where the MP integration chip lives.

### Cross-app boundary

`apps/api` ↔ `apps/ai` over HTTP. One process per app, one job each. The classifier is called per webhook (HTTP POST → Mastra workflow run → JSON response). Latency is negligible in dev; the UI never notices the extra hop because the SSE push happens after both legs complete.

---

## 4. Domain model

Four persisted entities (`User`, `PendingPrompt`, `Transaction`, `Classification`) and the interfaces that cross layers. Everything else is either an MP SDK type or a function parameter — we don't redefine MP's shapes.

### Entities

```ts
// apps/api/users/domain/user.ts
export type LanguageHint = 'es' | 'en' | null;

export interface User {
  readonly id: string;
  readonly displayName: string | null;
  readonly languagePref: LanguageHint;
  readonly mpUserId: string | null;
  readonly mpAccessToken: string | null;   // decrypted at the boundary
  readonly mpRefreshToken: string | null;
  readonly mpTokenExpiresAt: Date | null;
  readonly mpScope: string | null;
  readonly mpLiveMode: boolean | null;
  readonly mpConnectedAt: Date | null;
  readonly createdAt: Date;
}

export const isMpConnected = (u: User): boolean => u.mpUserId !== null;
export const isMpTokenExpired = (u: User, skewMs = 5 * 60_000): boolean =>
  u.mpTokenExpiresAt !== null
  && u.mpTokenExpiresAt.getTime() - skewMs < Date.now();
```

```ts
// apps/api/proactive/domain/pending-prompt.ts
export type PaymentKind = 'income' | 'expense';
export type ExpenseCategory =
  | 'comida' | 'transporte' | 'entretenimiento' | 'salud'
  | 'servicios' | 'educacion' | 'otros';
export type PendingPromptStatus = 'pending' | 'added' | 'discarded' | 'auto';
export type ProactiveIntent = 'confirm' | 'notice';

export interface PendingPrompt {
  readonly id: string;
  readonly userId: string;
  readonly mpPaymentId: string;
  readonly kind: PaymentKind;
  readonly amount: number;
  readonly merchant: string | null;
  readonly paymentDate: Date;
  readonly suggestedCategory: ExpenseCategory;
  readonly suggestedDescription: string;
  readonly confidence: number;
  readonly intent: ProactiveIntent;
  readonly noticeReason: 'mp_refund' | 'mp_chargeback' | null;
  readonly status: PendingPromptStatus;
  readonly resolvedTransactionId: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}
```

```ts
// apps/api/transactions/domain/transaction.ts
import type { ExpenseCategory } from '../../proactive/domain/pending-prompt';

export type TransactionDirection = 'expense' | 'income';
export type TransactionStatus = 'active' | 'refunded' | 'charged_back';

export interface Transaction {
  readonly id: string;
  readonly userId: string;
  readonly date: string;                       // ISO yyyy-MM-dd
  readonly amount: number;                     // ALWAYS positive
  readonly currency: 'ARS';
  readonly category: ExpenseCategory;
  readonly description: string;
  readonly merchant: string;
  readonly direction: TransactionDirection;
  readonly status: TransactionStatus;
  readonly statusChangedAt: Date | null;
  readonly source: 'manual' | 'mp_webhook';
  readonly mpPaymentId: string | null;
}
```

```ts
// apps/api/mp/domain/classification.ts
import type { ExpenseCategory } from '../../proactive/domain/pending-prompt';

export interface Classification {
  readonly category: ExpenseCategory;
  readonly suggestedDescription: string;
  readonly confidence: number;
}
```

### Domain helpers (pure functions)

```ts
// apps/api/mp/domain/is-completed-payment.ts
import type { Payment } from 'mercadopago/dist/clients/payment/commonTypes';

export const isCompletedPayment = (p: Payment): boolean => {
  if (p.status !== 'approved') return false;
  if (p.status_detail !== 'accredited') return false;
  if (p.captured === false) return false;
  return true;
};

// apps/api/mp/domain/map-mp-status.ts
import type { TransactionStatus } from '../../transactions/domain/transaction';

export const mapMpStatusToTransactionStatus = (s: Payment['status']):
  TransactionStatus => {
  if (s === 'refunded') return 'refunded';
  if (s === 'charged_back') return 'charged_back';
  return 'active';
};
```

### Interfaces

```ts
// apps/api/users/domain/users.repository.ts
export interface UsersRepository {
  getCurrent(): Promise<User>;
  findByMpUserId(mpUserId: string): Promise<User | null>;
  linkMpAccount(userId: string, mp: Pick<User,
    'mpUserId' | 'mpAccessToken' | 'mpRefreshToken'
    | 'mpTokenExpiresAt' | 'mpScope' | 'mpLiveMode' | 'mpConnectedAt'
  >): Promise<void>;
  updateMpTokens(userId: string, fields: Pick<User,
    'mpAccessToken' | 'mpRefreshToken' | 'mpTokenExpiresAt'
  >): Promise<void>;
  unlinkMpAccount(userId: string): Promise<void>;
}

// apps/api/mp/domain/mp-payment-source.ts
import type { Payment } from 'mercadopago/dist/clients/payment/commonTypes';
export interface MpPaymentSource {
  getById(paymentId: string, userId: string): Promise<Payment>;
}

// apps/api/mp/domain/payment-classifier.ts
export interface PaymentClassifier {
  classify(args: {
    readonly kind: PaymentKind;
    readonly amount: number;
    readonly merchant: string | null;
    readonly description: string | null;
    readonly counterparty: string | null;
  }): Promise<Classification>;
}

// apps/api/proactive/domain/pending-prompts.repository.ts
export interface PendingPromptsRepository {
  create(p: Omit<PendingPrompt,
    'resolvedTransactionId' | 'resolvedAt'>,
    trx?: Database
  ): Promise<PendingPrompt>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<PendingPrompt | null>;
  listPending(userId: string): Promise<PendingPrompt[]>;
  getById(userId: string, id: string): Promise<PendingPrompt | null>;
  markAdded(id: string, txId: string, trx?: Database): Promise<void>;
  markDiscarded(id: string, reason?: 'mp_refund' | 'mp_chargeback'): Promise<void>;
}

// apps/api/proactive/domain/proactive-event-bus.ts
export interface ProactiveEventBus {
  publish(userId: string, prompt: PendingPrompt): void;
  subscribe(userId: string, fn: (p: PendingPrompt) => void): () => void;
}

// apps/api/transactions/domain/transactions.repository.ts
export interface TransactionsRepository {
  create(input: Omit<Transaction, 'statusChangedAt'>, trx?: Database): Promise<Transaction>;
  getById(userId: string, id: string): Promise<Transaction>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<Transaction | null>;
  updateStatus(id: string, newStatus: TransactionStatus, at: Date, trx?: Database): Promise<void>;
}
```

### Infrastructure-layer DTOs

Two types live next to where they're consumed, not in `domain/`:

```ts
// apps/api/mp/interface/mp-webhook.dto.ts
export interface MpWebhookBody {
  readonly id: number;
  readonly live_mode: boolean;
  readonly type: 'payment';
  readonly date_created: string;
  readonly user_id: number;
  readonly api_version: string;
  readonly action: 'payment.created' | 'payment.updated';
  readonly data: { readonly id: string };
}

// apps/api/mp/providers/mp-oauth-response.ts
export interface MpOAuthTokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly scope: string;
  readonly user_id: number;
  readonly refresh_token: string;
  readonly public_key: string;
  readonly live_mode: boolean;
}
```

---

## 5. Data flow

### Webhook arrives (three branches)

```
1.  MP fires:  POST <ngrok>/mp/webhook
               body: MpWebhookBody, headers: x-signature, x-request-id

2.  MpWebhookController:
       • MpSignatureVerifier.verify(headers, body) → 401 if mismatch
       • parse body (Zod) → 400 if shape wrong
       • return 200 IMMEDIATELY
       • fire-and-forget: ProcessMpEvent.execute({ paymentId, mpUserId })

3.  ProcessMpEvent.execute({ paymentId, mpUserId }):

    a. user = UsersRepository.findByMpUserId(mpUserId)
       if !user → drop (unknown account; pre/post-disconnect race)

    b. existingTx = TransactionsRepository.findByMpPaymentId(user.id, paymentId)
       payment = MpPaymentSource.getById(paymentId, user.id)
       newStatus = mapMpStatusToTransactionStatus(payment.status)

    ┌── BRANCH 1: existingTx ─────────────────────────────────────────┐
    │   if (newStatus === existingTx.status) → drop (idempotent)       │
    │   else MarkTransactionReversed.execute({                          │
    │            userId, transactionId: existingTx.id, newStatus,        │
    │            mpPaymentId                                            │
    │        })                                                         │
    │     ↳ tx.status = newStatus, statusChangedAt = now                │
    │     ↳ pendingPrompts.create({                                     │
    │           intent: 'notice', status: 'auto',                        │
    │           mpPaymentId: `${mpPaymentId}:reversal`,                  │
    │           noticeReason: 'mp_refund'|'mp_chargeback', ...           │
    │       })                                                          │
    │       (suffix `:reversal` avoids colliding with the original       │
    │        confirm prompt on the unique index; second refund webhook   │
    │        for the same payment is dropped by branch's status check)   │
    │     ↳ bus.publish(userId, notice)                                  │
    └────────────────────────────────────────────────────────────────────┘

    ┌── BRANCH 2: no tx, !isCompletedPayment(payment) ────────────────┐
    │   pendingPrompt = PendingPromptsRepository.findByMpPaymentId(...) │
    │   if pendingPrompt && payment.status ∈ {refunded, charged_back}: │
    │       markDiscarded(pendingPrompt.id, reason)                    │
    │       bus.publish(userId, updatedPrompt)                          │
    │   else → drop (still pending / authorized / rejected)            │
    └────────────────────────────────────────────────────────────────────┘

    ┌── BRANCH 3: no tx, isCompletedPayment(payment) ─────────────────┐
    │   dedupe = PendingPromptsRepository.findByMpPaymentId(...)        │
    │   if dedupe → drop (idempotent on MP retries)                    │
    │   kind = payment.collector.id === user.mpUserId                  │
    │             ? 'income' : 'expense'                               │
    │   counterparty = kind === 'income'                               │
    │             ? payment.payer.first_name + ...                     │
    │             : payment.collector...                               │
    │   classification = PaymentClassifier.classify({ kind, amount,    │
    │             merchant, description, counterparty })                │
    │     (HTTP POST → apps/ai → fallback {otros, '', 0} on failure)   │
    │   prompt = pendingPrompts.create({                                │
    │             intent: 'confirm', status: 'pending', ...             │
    │         })                                                        │
    │   bus.publish(user.id, prompt)                                    │
    └────────────────────────────────────────────────────────────────────┘
```

### User acts on a confirm card

```
Agregar (accept as-is)
   UI:  POST /proactive/p_42/resolve  body: { action: 'add' }
   api: ResolveProactivePrompt
          • loads prompt (must be status: 'pending', intent: 'confirm')
          • single SQLite transaction:
              AddTransaction.execute({ ...prompt fields, mpPaymentId,
                                       source: 'mp_webhook', direction: kind })
              markAdded(prompt.id, transaction.id)
          • returns { prompt, transaction }
   UI:  card locks ("Agregado como comida"); Gasti turn appears below

Editar (accept with overrides)
   UI:  expands inline edit row (category picker + description input)
   UI:  POST /proactive/p_42/resolve  body: {
            action: 'add',
            overrides: { category: 'transporte', description: 'Uber',
                         rememberMerchantCategory: true }
        }
   api: same as Agregar; applies overrides before persistence; if
        rememberMerchantCategory → also calls OverrideMerchantCategory
   UI:  card locks with edited values; Gasti turn reflects final values

Descartar
   UI:  POST /proactive/p_42/resolve  body: { action: 'discard' }
   api: markDiscarded(prompt.id); no transaction created
   UI:  card locks ("Descartado"); no Gasti turn (silent)
```

### UI connect / reconnect

```
ChatPage mounts:
  1. GET /proactive/pending → array of unresolved prompts + recent auto notices
  2. Insert into thread at their createdAt timestamps
  3. new EventSource('/proactive/stream') → subscribe live
  4. on 'prompt.created' → upsert by id
  5. on 'prompt.resolved' → patch status by id (covers cross-tab updates)
  6. on unmount → close EventSource

Reconnect after drop:
  • EventSource auto-reconnects (native backoff)
  • On reconnect, re-fetch /proactive/pending to backfill
  • Upsert by id makes duplicates harmless
```

---

## 6. SQLite schema

One DB file at `apps/api/data/gasti.db`. Migrations run on app boot.

```sql
create table users (
  id                       text primary key,
  display_name             text,
  language_pref            text,
  mp_user_id               text unique,
  mp_access_token_enc      blob, mp_access_token_iv  blob, mp_access_token_tag  blob,
  mp_refresh_token_enc     blob, mp_refresh_token_iv blob, mp_refresh_token_tag blob,
  mp_token_expires_at      text,
  mp_scope                 text,
  mp_live_mode             integer,
  mp_connected_at          text,
  created_at               text not null
);

create table pending_prompts (
  id                       text primary key,
  user_id                  text not null references users(id),
  mp_payment_id            text not null,
  kind                     text not null check (kind in ('income','expense')),
  amount                   real not null,
  merchant                 text,
  payment_date             text not null,
  suggested_category       text not null,
  suggested_description    text not null,
  confidence               real not null,
  intent                   text not null check (intent in ('confirm','notice')),
  notice_reason            text check (notice_reason in ('mp_refund','mp_chargeback') or notice_reason is null),
  status                   text not null check (status in ('pending','added','discarded','auto')),
  resolved_transaction_id  text,
  created_at               text not null,
  resolved_at              text
);
create unique index idx_pending_mp_payment on pending_prompts (user_id, mp_payment_id);
create index idx_pending_status on pending_prompts (user_id, status, created_at);

create table transactions (
  id                       text primary key,
  user_id                  text not null references users(id),
  date                     text not null,
  amount                   real not null,
  currency                 text not null default 'ARS',
  category                 text not null,
  description              text not null,
  merchant                 text not null,
  direction                text not null default 'expense' check (direction in ('expense','income')),
  status                   text not null default 'active'  check (status in ('active','refunded','charged_back')),
  status_changed_at        text,
  source                   text not null default 'manual'  check (source in ('manual','mp_webhook')),
  mp_payment_id            text
);
create unique index idx_tx_mp_payment_id
  on transactions(user_id, mp_payment_id) where mp_payment_id is not null;
```

**Seed migration:** on first boot, if `users` is empty → insert `default-user`. If `transactions` is empty → hydrate from `data/transactions.json` with `user_id='default-user'`, `direction='expense'`, `status='active'`, `source='manual'`.

---

## 7. Wire formats

**Inbound webhook** (typed as `MpWebhookBody`):
```http
POST /mp/webhook
x-signature: ts=1747200000,v1=abc...
x-request-id: 9d8a...
{
  "action": "payment.updated", "api_version": "v1",
  "data": { "id": "PAY_12345" }, "date_created": "...",
  "user_id": 12345, "live_mode": true, "type": "payment", "id": 0
}
```

**`apps/api` → `apps/ai` classify** (HTTP):
```http
POST http://localhost:4111/workflows/classify-mp-event/run
{ "kind": "expense", "amount": 12500, "merchant": "Rappi",
  "description": "Compra Rappi #88231", "counterparty": "Rappi Argentina S.A." }
→ { "category": "comida", "suggestedDescription": "Pedido Rappi", "confidence": 0.86 }
```

**SSE** (`/proactive/stream`):
```
event: prompt.created
data: <PendingPrompt JSON>

event: prompt.resolved
data: { "id": "p_42", "status": "added", "resolvedTransactionId": "tx_1101" }
```

**REST**:
```http
GET  /proactive/pending           → { "prompts": PendingPrompt[] }
POST /proactive/:id/resolve       → { "prompt": PendingPrompt, "transaction": Transaction | null }
        body: { "action": "add", "overrides"?: {...} } | { "action": "discard" }

GET  /mp/oauth/start              → 302 → MP authorization URL
GET  /mp/oauth/callback?code&state → 302 → /
POST /mp/oauth/disconnect         → 204
GET  /mp/oauth/status             → { "connected": boolean, "mpUserIdLast4"?: string, "connectedAt"?: string }
```

---

## 8. UI surfaces

All visuals conform to DESIGN.md tokens. Three new UI surfaces:

### Composer chip row (extends DESIGN.md composer)

The composer changes from a single rounded pill to a vertical stack with a bottom chip row (ChatGPT-style). This is an explicit DESIGN.md deviation, justified by extensibility (future integrations slot in as additional chips).

```
┌───────────────────────────────────────────────────────────────┐
│  Pregúntame lo que quieras                       (text input) │
├───────────────────────────────────────────────────────────────┤
│  [💳 Conectá Mercado Pago]  …future chips…           [ ⮕ ]   │
└───────────────────────────────────────────────────────────────┘
   frosted glass, --blur-2,                          send button:
   border-radius: --r-lg (20px, down from --r-pill)  36×36 circle
```

**Chip:** pill (`--r-pill`), `--surface-tint` background, hairline border, 16px Lucide `wallet` icon in `--ai-violet-ink`, label in `--t-label` 500. Two states:
- **Disconnected** — *"Conectá Mercado Pago"*; sparkle accent on the icon-tile. Click → `/mp/oauth/start`.
- **Connected** — *"Mercado Pago"* with 4px `--pos` dot; click opens a frosted popover (`--e-3`, `--r-lg`) with connection metadata and a "Desconectar" text button.

### Proactive prompt card (intent='confirm')

In-chat assistant turn:
- Eyebrow: 14px sparkle in `--ai-violet` + "GASTI" in `--t-label-tiny`, uppercase, `--tracking-eyebrow`, `--ai-violet-ink`
- Body (`--t-body-lg`, `--ink-1`):
  *"Vi un pago de $12.500 a Rappi del 14 de mayo. Categoría sugerida: comida."*
  Confidence cue:
  - `>= 0.7` — no badge
  - `0.4–0.7` — caption "Categoría sugerida" in `--ink-3`
  - `< 0.4` — category chip with `--warn-soft` background, caption "Revisalo"
- Option pills (stacked, `--r-md` 14px each, `--surface-tint`, hairline, `--ai-violet-ink` label):
  - **Agregar** — primary action
  - **Editar** — expands inline category picker + description input + "Recordar [merchant] como [category]" checkbox
  - **Descartar** — silent rejection

On action → card locks, captioned with the outcome ("Agregado como comida" / "Descartado") and (for `add` only) a Gasti turn appears below: *"Listo, sumé $12.500 a comida."*

### Proactive notice card (intent='notice')

Read-only, no pills. Same lavender row variant from DESIGN.md, same eyebrow.

For `noticeReason: 'mp_refund'`:
> *"Mercado Pago reembolsó tu pago a Rappi del 14 de mayo ($12.500). La marcamos como reembolsada."*
> small caption: *"Tu total de comida bajó automáticamente."*

For `noticeReason: 'mp_chargeback'`:
> *"Mercado Pago revirtió tu pago a Rappi del 14 de mayo ($12.500) por un contracargo."*
> small caption: *"Esa transacción ya no cuenta en tus totales."*

Notice cards never trigger a follow-up Gasti turn — the card IS the agent speaking.

---

## 9. Auth & token security

### OAuth flow (MP Connect)

```
1. UI chip click → GET /mp/oauth/start
2. api: generate `state` nonce, store in session cookie
3. api: 302 → https://auth.mercadopago.com/authorization?client_id=...&response_type=code&platform_id=mp&state=...&redirect_uri=...
4. user authorizes in MP
5. MP 302 → GET /mp/oauth/callback?code=...&state=...
6. api: verify state, POST https://api.mercadopago.com/oauth/token
   (mercadopago SDK handles HTTP)
7. api: LinkMpAccount use-case → UsersRepository.linkMpAccount(...)
8. api: 302 → /
9. UI: chip flips to connected state
```

### Token storage — AES-256-GCM at rest

`TOKEN_ENCRYPTION_KEY` (32-byte base64) in `apps/api/.env`. `TokenCipher` provider in `apps/api/shared/security/` wraps Node's `crypto.createCipheriv('aes-256-gcm', ...)`. `UsersRepository`:
- on write: encrypt access + refresh tokens, persist IV + auth tag alongside ciphertext
- on read: decrypt and return decoded strings on the `User` value object

Use-cases never see ciphertext. Key absent at boot → API refuses to start. Key changed between runs → existing rows fail to decrypt; boot logs a clear mismatch warning; all users effectively treated as disconnected until they re-connect.

### Token refresh

```ts
async ensureFreshToken(user: User): Promise<string> {
  if (!isMpTokenExpired(user, 5 * 60_000)) return user.mpAccessToken!;
  return await RefreshMpToken.execute(user.id);   // refreshes; throws MpReauthRequiredError on terminal failure
}
```

`RefreshMpToken` uses the SDK's OAuth client; on `400 invalid_grant` (refresh token expired), calls `unlinkMpAccount` and throws `MpReauthRequiredError` — the user has to re-connect.

### Env vars summary

```
apps/api/.env
  MP_CLIENT_ID         <MP application id>
  MP_CLIENT_SECRET     <MP application secret>
  MP_WEBHOOK_SECRET    <signing secret for inbound webhook verification>
  MP_REDIRECT_URI      <ngrok>/mp/oauth/callback
  TOKEN_ENCRYPTION_KEY <32-byte base64>

apps/ai/.env
  OPENAI_API_KEY       <provider key for the classifier workflow>
```

---

## 10. SSE & the in-process bus

The SSE controller and the webhook handler don't import each other. They communicate via `ProactiveEventBus`, a tiny in-memory pub/sub keyed by `userId`:

```ts
@Injectable()
export class InMemoryProactiveEventBus implements ProactiveEventBus {
  private byUser = new Map<string, Set<(p: PendingPrompt) => void>>();

  publish(userId: string, prompt: PendingPrompt) {
    this.byUser.get(userId)?.forEach((fn) => fn(prompt));
  }

  subscribe(userId: string, fn: (p: PendingPrompt) => void): () => void {
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(fn);
    return () => this.byUser.get(userId)?.delete(fn);
  }
}
```

The SSE controller subscribes per HTTP connection and writes each event into the response stream as `event: prompt.created\ndata: <json>\n\n`. On disconnect, it unsubscribes. Multi-tab works because each tab is its own subscription. Future multi-process: replace impl with Redis pub/sub; everything else unchanged.

---

## 11. Error handling & edge cases

| Failure | Behavior |
|---|---|
| Webhook signature mismatch | 401, log truncated header, no body |
| Webhook body fails schema | 400, log to alert |
| Webhook type ≠ `payment` | 200 (drop), ack so MP doesn't retry |
| `live_mode` mismatches app mode | 200 (drop) |
| Unknown `mp_user_id` (no User row) | 200 (drop) |
| Duplicate webhook (already-resolved or already-pending mp_payment_id) | 200 (drop), idempotent |
| MP API 401 fetching payment | refresh token once + retry; if still 401, treat as disconnected |
| MP API 429 / 5xx / timeout | Exponential backoff 3× (250ms/1s/4s); if exhausted, drop with logged error (no retry queue in v1) |
| Payment not in `isCompletedPayment` state | Drop, but if a pending prompt exists and status is refunded/charged_back → mark prompt `discarded` with reason |
| Classifier (`apps/ai`) unreachable / timeout / invalid response | Retry once at 500ms; otherwise fallback to `{ category: 'otros', description: <merchant ?? "Movimiento de Mercado Pago">, confidence: 0 }`. Prompt is still created. |
| Two webhooks for same payment race | Unique index `(user_id, mp_payment_id)` on `pending_prompts` and `transactions`; second insert fails, caught silently |
| Two tabs resolve same prompt | Status check inside SQL transaction; second call returns idempotent result |
| `AddTransaction` succeeds, `markAdded` fails | Wrapped in one SQLite transaction, both rollback together |
| MP changes approved → refunded after we added the tx | Branch 1 of `ProcessMpEvent` → `MarkTransactionReversed` → status flip + notice card. **No agent call.** |
| MP changes approved → refunded before we showed prompt | Branch 2 → mark pending prompt `discarded` with reason. No tx ever created. |
| Refresh token expired (180-day MP refresh window) | `unlinkMpAccount` + `MpReauthRequiredError`; chip flips to disconnected; user re-connects |
| Encryption key missing at boot | API refuses to start (loud) |
| Encryption key changed | Boot warns; users effectively disconnected; never overwrite encrypted columns automatically |
| SSE drops (sleep, network blip) | EventSource auto-reconnect + `/pending` backfill; upsert by id |
| ngrok URL changes between runs | Use MP MCP `save_webhook` to re-register (documented in README) |

### What we do NOT handle in v1

- Persistent retry queue for failed MP fetches.
- Refund propagation modeling beyond status flip (no partial-refund amount tracking; future work via `transaction_amount_refunded` field).
- Chargeback reinstatement (rare; logged warning).
- Multi-MP-account per user.
- Webhook replay endpoint of our own (MP's developer panel has "Resend notification").

---

## 12. Verification (manual)

A reviewer should walk this script top to bottom. This is the deliverable check.

**Setup** (one-time, documented in README):
```
1. bun install
2. apps/api/.env with MP_CLIENT_ID, MP_CLIENT_SECRET, MP_WEBHOOK_SECRET,
   MP_REDIRECT_URI, TOKEN_ENCRYPTION_KEY
3. apps/ai/.env with OPENAI_API_KEY
4. ngrok http 3001 → copy URL
5. MP dev panel: set webhook URL to <ngrok>/mp/webhook, topic 'payments';
   set redirect URI to <ngrok>/mp/oauth/callback
   (or use MP MCP `save_webhook`)
6. bun dev
```

**Test cases:**
1. **Connect:** chip disconnected → click → MP auth → redirect back → chip connected.
2. **Happy expense:** sandbox-trigger a payment → card appears within ~5s with sparkle eyebrow, body copy, pills.
3. **Agregar:** card locks, "Agregado como [category]" caption, Gasti turn below. SQLite has the row with `source='mp_webhook'`, `direction='expense'`, `status='active'`.
4. **Editar with override:** edit category, check "Recordar [merchant]" → card locks with edited values → next payment from same merchant uses the override.
5. **Descartar:** card locks, no Gasti turn, no transaction.
6. **Happy income:** sandbox-trigger an incoming payment → card appears with `kind='income'` framing.
7. **Refund flow:** refund the first transaction in MP → notice card appears in thread; original tx row's `status='refunded'`, `statusChangedAt` set; "¿cuánto gasté en comida?" reflects lower total; **no new transaction row created**.
8. **Multi-tab:** both tabs render same card; resolving in one tab updates the other.
9. **SSE reconnect:** throttle network offline, trigger payment, reconnect → card appears via `/pending` backfill within seconds.
10. **Disconnect:** click chip → popover → Desconectar → chip flips back; new MP webhooks drop silently. Pending prompts that existed pre-disconnect remain visible. Reconnect restores everything.
11. **Webhook security:** curl with no signature → 400; curl with bad signature → 401; MP-fired → 200 (verified via MP MCP `notifications_history`).
12. **Idempotency:** "Resend notification" 3× in MP panel → exactly one card / one DB row.
13. **Degraded modes:** kill `apps/ai` → card still appears with category='otros', confidence=0. Bogus MP_ACCESS_TOKEN → refresh fires → eventual MpReauthRequired → chip flips disconnected.

### MP MCP tools for dev/verify

- `save_webhook` — register the ngrok URL from chat
- `create_test_user` + `add_money_test_user` — sandbox payers
- `notifications_history` — confirm delivery / debug failures
- `quality_checklist` / `quality_evaluation` — MP's own health checks against our endpoint

---

## 13. Out of scope (v1)

- Mobile chrome / responsive PWA polish beyond what DESIGN.md already covers
- Multi-user runtime (data model is multi-tenant-ready; user determination logic stays singleton)
- Push notifications when chat is closed (notice persists in `pending_prompts`, surfaced on next open)
- CSV / file import of MP history (only live webhooks)
- Connecting accounts other than MP (chip row is extensible; no other integrations built)
- Refund / chargeback reinstatement
- Partial-refund amount tracking
- Persistent retry queue for failed MP fetches

---

## 14. Locations summary (Clean Architecture)

```
apps/api/src/
├── users/
│   ├── domain/{user.ts, users.repository.ts}
│   ├── use-cases/{link-mp-account.ts, refresh-mp-token.ts, get-current-user.ts}
│   ├── repositories/sqlite-users.repository.ts
│   ├── providers/current-user.provider.ts
│   └── users.module.ts
├── mp/
│   ├── domain/{mp-payment-source.ts, payment-classifier.ts, classification.ts,
│   │           is-completed-payment.ts, map-mp-status.ts}
│   ├── use-cases/{process-mp-event.ts, start-mp-connect.ts, complete-mp-connect.ts}
│   ├── providers/{mercado-pago.provider.ts, http-payment-classifier.ts,
│   │              mp-signature-verifier.ts}
│   ├── interface/{mp-webhook.controller.ts, mp-oauth.controller.ts, mp-webhook.dto.ts}
│   └── mp.module.ts
├── proactive/
│   ├── domain/{pending-prompt.ts, pending-prompts.repository.ts, proactive-event-bus.ts}
│   ├── use-cases/{resolve-proactive-prompt.ts, list-pending-prompts.ts}
│   ├── repositories/sqlite-pending-prompts.repository.ts
│   ├── providers/in-memory-proactive-event-bus.ts
│   ├── interface/proactive.controller.ts
│   └── proactive.module.ts
├── transactions/
│   ├── domain/{transaction.ts, transactions.repository.ts}
│   ├── use-cases/{add-transaction.ts, mark-transaction-reversed.ts}
│   ├── repositories/sqlite-transactions.repository.ts
│   └── transactions.module.ts
└── shared/security/token-cipher.provider.ts

apps/ai/src/mastra/
└── mp-classification/
    ├── domain/{classification.ts}
    ├── use-cases/{detect-payment-kind.ts, pick-category.ts, draft-description.ts}
    └── workflows/classify-mp-event.ts            (Mastra Workflow primitive)

apps/ui/
├── components/composer/
│   ├── Composer.tsx
│   ├── ComposerChipRow.tsx
│   └── chips/MercadoPagoChip.tsx
├── components/proactive/
│   ├── ProactivePromptCard.tsx
│   ├── ProactiveNoticeCard.tsx
│   └── index.ts
├── features/proactive/
│   ├── useProactivePrompts.ts
│   └── useMpConnection.ts
└── app/chat/page.tsx
```

---

## 15. References

- [PRODUCT.md](../../../PRODUCT.md) — product domain, user, constraints
- [DESIGN.md](../../../DESIGN.md) — design system, tokens, component patterns
- [CLAUDE.md](../../../CLAUDE.md) — Clean Architecture rules, Superpowers workflow, Mastra rules
- Mercado Pago Developers — webhooks, payment resource, OAuth Connect (queried live via MP MCP)
- Mastra MCP — `@mastra/mcp-docs-server` for current Mastra primitive docs
