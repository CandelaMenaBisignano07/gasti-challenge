# MP payment status events — design

**Date:** 2026-05-23
**Author:** Cande + Gasti (Claude)
**Status:** Design ready for review

## Problem

Two related gaps in Gasti's handling of Mercado Pago `/v1/payments` results:

1. **Cancellations are silently dropped.** MP returns `status: "canceled"` for
   payments cancelled by the payer, collector, API, or after 30 days
   expired. Gasti has no branch for this status, so a payment that gets
   cancelled after Gasti already created the transaction stays `active`
   forever, and a payment cancelled while a pending prompt is open keeps the
   prompt live (the user can confirm a payment that no longer exists).

2. **Pre-existing typo in our internal enum.** `MpPayment.status` in
   `apps/api/src/mp/domain/mp-payment.ts:13` declares `'cancelled'` (two
   L's). MP's API consistently returns `'canceled'` (one L). This means
   the enum value is unreachable: any code that branched on `'cancelled'`
   would never execute against real MP responses.

3. **Chargebacks resolved in the seller's favor are not reflected.** MP
   models chargeback outcomes via `status_detail` while `status` stays
   `'charged_back'`. The three sub-states are:

   - `in_process`: dispute opened, money temporarily withheld, under review.
   - `settled`: seller lost. Money permanently retired from seller's account.
   - `reimbursed`: seller won. Money returned to seller's account — the
     transaction is effectively back to active.

   Gasti only branches on `status`, so once a payment is flipped to
   `'charged_back'` it stays there even when MP later marks it
   `reimbursed`. The user's totals never recover.

## Goals

- Treat MP `'canceled'` as a terminal Gasti status, parallel to `refunded`
  and `charged_back`. Notify the user with a notice card and discard pending
  prompts whose underlying payment got cancelled.
- Detect `charged_back + reimbursed` and revert the transaction back to
  `'active'`, notifying the user that the chargeback was resolved in their
  favor.
- Fix the `cancelled` → `canceled` typo so MP responses actually match our
  internal enum.
- Persist `Transaction.statusDetail` so idempotency checks can distinguish
  `charged_back + in_process` from `charged_back + reimbursed` (same
  `status`, different sub-states).

## Non-goals

- Filtering non-`active` transactions out of spending / insights
  aggregations. Out of scope; surfaced as an open question.
- Handling partial refunds (`approved + partially_refunded`). Real bug, but
  the design is materially different (status_detail inside approved,
  amount reconciliation against `transactions.refunds[]`) — separate spec.
- Handling `in_mediation`. Informational only, no money movement yet —
  deferred.
- Adding `intent='cancellation'` to PendingPrompt. The existing
  `intent='notice'` + `noticeReason` discriminator is enough.
- Server-side filtering in the MP search gateway. Backfill and polling
  already fetch every status without a `status` query param; that
  behavior is preserved.

## Design

### 1. Domain (apps/api)

**`apps/api/src/mp/domain/mp-payment.ts:13`** — fix the typo:

```ts
status:
  | 'pending' | 'approved' | 'authorized'
  | 'in_process' | 'in_mediation' | 'rejected'
  | 'canceled'              // ← was 'cancelled'
  | 'refunded' | 'charged_back';
```

**`apps/api/src/shared/domain/transaction.ts`** — extend the status enum
*and* add `statusDetail`:

```ts
export const transactionStatusSchema = z.enum([
  'active',
  'refunded',
  'charged_back',
  'canceled',
]);

export const transactionSchema = z.object({
  // ...existing fields...
  status: transactionStatusSchema.default('active'),
  statusChangedAt: z.string().nullable().default(null),
  statusDetail: z.string().nullable().default(null),   // ← new
  // ...
});
```

`statusDetail` stores MP's raw `status_detail` string (e.g.
`'by_payer'`, `'reimbursed'`, `'settled'`). It is part of the idempotency
key together with `status`. Existing JSON rows parse fine because of the
default.

**`apps/api/src/proactive/domain/pending-prompt.ts:6`** — extend
`NoticeReason`:

```ts
export type NoticeReason =
  | 'mp_refund'
  | 'mp_chargeback'
  | 'mp_cancellation'
  | 'mp_chargeback_reimbursed';
```

**Drop `apps/api/src/mp/domain/map-mp-status.ts`** in favor of a richer
classifier that looks at both `status` and `status_detail`:

**`apps/api/src/mp/domain/classify-mp-status-change.ts`** (new):

```ts
import type { MpPayment } from './mp-payment';
import type { TransactionStatus } from '../../shared/domain/transaction';
import type { NoticeReason } from '../../proactive/domain/pending-prompt';

export interface MpStatusChange {
  readonly newTransactionStatus: TransactionStatus;
  readonly newStatusDetail: string | null;
  readonly noticeReason: NoticeReason;
  /** Whether a pending prompt for this payment should be discarded. */
  readonly invalidatesPrompt: boolean;
}

export const classifyMpStatusChange = (payment: MpPayment): MpStatusChange | null => {
  if (payment.status === 'refunded') {
    return {
      newTransactionStatus: 'refunded',
      newStatusDetail: payment.status_detail,
      noticeReason: 'mp_refund',
      invalidatesPrompt: true,
    };
  }
  if (payment.status === 'canceled') {
    return {
      newTransactionStatus: 'canceled',
      newStatusDetail: payment.status_detail,
      noticeReason: 'mp_cancellation',
      invalidatesPrompt: true,
    };
  }
  if (payment.status === 'charged_back') {
    if (payment.status_detail === 'reimbursed') {
      return {
        newTransactionStatus: 'active',
        newStatusDetail: 'reimbursed',
        noticeReason: 'mp_chargeback_reimbursed',
        invalidatesPrompt: false,
      };
    }
    return {
      newTransactionStatus: 'charged_back',
      newStatusDetail: payment.status_detail,
      noticeReason: 'mp_chargeback',
      invalidatesPrompt: true,
    };
  }
  return null; // pending / in_process / authorized / in_mediation / rejected / approved
};
```

This is the only place where status_detail decoding lives. It's pure,
trivially testable, framework-agnostic — lives in `domain/`.

### 2. Use-case (apps/api)

**`apps/api/src/transactions/use-cases/mark-transaction-reversed.use-case.ts`** —
rename and broaden. The name "Reversed" is wrong for the reimbursed case
(it un-reverses). Rename to `UpdateTransactionStatus`:

```ts
// apps/api/src/transactions/use-cases/update-transaction-status.use-case.ts
@Injectable()
export class UpdateTransactionStatus {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    transactionId: string;
    newStatus: TransactionStatus;
    newStatusDetail: string | null;
  }): Promise<void> {
    await this.repo.updateStatus(
      input.transactionId,
      input.newStatus,
      input.newStatusDetail,
      this.clock.now(),
    );
  }
}
```

The repository signature changes accordingly:

```ts
updateStatus(
  id: string,
  newStatus: TransactionStatus,
  newStatusDetail: string | null,
  at: Date,
): Promise<void>;
```

Single call site (`ProcessMpEvent`) gets updated.

**`apps/api/src/mp/use-cases/process-mp-event.use-case.ts`** — drop
`mapMpStatusToTransactionStatus` and `REVERSAL_NOTICE_REASON`; route both
branches through the classifier.

```ts
async execute({ payment, user }: ProcessMpEventInput): Promise<void> {
  const paymentId = String(payment.id);
  const existingTx = await this.transactions.findByMpPaymentId(user.id, paymentId);
  const change = classifyMpStatusChange(payment);

  // BRANCH 1 — the payment already exists as a transaction.
  if (existingTx) {
    if (!change) return;                                  // not a relevant transition
    if (
      change.newTransactionStatus === existingTx.status &&
      change.newStatusDetail === existingTx.statusDetail
    ) return;                                             // idempotent

    await this.updateStatus.execute({
      transactionId: existingTx.id,
      newStatus: change.newTransactionStatus,
      newStatusDetail: change.newStatusDetail,
    });

    const notice = await this.prompts.create(
      this.draftPrompt({
        userId: user.id,
        mpPaymentId: `${paymentId}:${change.noticeReason}`,
        kind: existingTx.direction,
        payment,
        intent: 'notice',
        status: 'auto',
        noticeReason: change.noticeReason,
        suggestedCategory: existingTx.category,
        suggestedDescription: existingTx.description,
        merchant: existingTx.merchant,
        counterparty: existingTx.counterparty,
        confidence: 1,
      }),
    );
    this.bus.publish(user.id, notice);
    return;
  }

  // BRANCH 2 — no transaction and the payment is not completed.
  if (!isCompletedPayment(payment)) {
    if (change?.invalidatesPrompt) {
      const pending = await this.prompts.findByMpPaymentId(user.id, paymentId);
      if (pending) {
        await this.prompts.markDiscarded(pending.id, change.noticeReason);
        const updated = await this.prompts.getById(user.id, pending.id);
        if (updated) this.bus.publish(user.id, updated);
      }
    }
    return;
  }

  // BRANCH 3 — unchanged (new completed payment → confirm prompt).
}
```

Two important details:

- **Idempotency now compares (status, statusDetail).** `charged_back + in_process` and `charged_back + reimbursed` share `status` but differ in `statusDetail`, so a single comparison field would miss the transition.
- **The notice's `mpPaymentId` key gains a per-reason suffix** (`:mp_chargeback`, `:mp_chargeback_reimbursed`, `:mp_cancellation`, `:mp_refund`). Today the code uses `:reversal`; with multiple possible notices per payment, the suffix must encode which one to keep `findByMpPaymentId` lookups from colliding.

**Unchanged.** `BackfillMpPayments` and `PollMpPayments` keep fetching every
status without a server-side filter; only the downstream classification
changes.

### 3. UI (apps/ui)

**`apps/ui/src/proactive/domain/pending-prompt.ts:3`** — mirror the API
`NoticeReason`:

```ts
export type PendingPromptNoticeReason =
  | 'mp_refund'
  | 'mp_chargeback'
  | 'mp_cancellation'
  | 'mp_chargeback_reimbursed';
```

**`apps/ui/src/transactions/domain/transaction.ts:4`** — extend
`TransactionStatus`:

```ts
export type TransactionStatus = 'active' | 'refunded' | 'charged_back' | 'canceled';
```

(No `statusDetail` mirror in the UI domain — UI does not render it.)

**`apps/ui/src/transactions/components/transaction-row.tsx`** — extend the
`STATUS_LABEL` record:

```ts
const STATUS_LABEL: Record<TransactionStatus, string> = {
  active: '',
  refunded: 'Reembolsada',
  charged_back: 'Contracargo',
  canceled: 'Cancelada',
};
```

**`apps/ui/src/proactive/components/proactive-notice-card.tsx`** — refactor
the binary `isRefund` into a four-entry map; introduce `noun` derivation
(applies to all four reasons for consistency with the project's existing
`OPERATION_LABEL` discrimination):

```ts
const counterpart = prompt.merchant ?? prompt.suggestedDescription;
const date = formatPromptDate(prompt.paymentDate);
const noun = prompt.operationType === 'money_transfer' ? 'transferencia' : 'pago';
const amount = <Num value={prompt.amount} size="sm" />;

const COPY: Record<PendingPromptNoticeReason, { primary: ReactNode; secondary: string }> = {
  mp_refund: {
    primary: <>Mercado Pago reembolsó tu {noun} a {counterpart} del {date} ({amount}). La marcamos como reembolsada.</>,
    secondary: `Tu total de ${prompt.suggestedCategory} bajó automáticamente.`,
  },
  mp_chargeback: {
    primary: <>Mercado Pago revirtió tu {noun} a {counterpart} del {date} ({amount}) por un contracargo.</>,
    secondary: 'Esa transacción ya no cuenta en tus totales.',
  },
  mp_cancellation: {
    primary: <>Mercado Pago canceló tu {noun} a {counterpart} del {date} ({amount}). La marcamos como cancelada.</>,
    secondary: 'Esa transacción quedó cancelada en tus totales.',
  },
  mp_chargeback_reimbursed: {
    primary: <>Mercado Pago resolvió el contracargo a tu favor. Tu {noun} a {counterpart} del {date} ({amount}) vuelve a contar.</>,
    secondary: `Tu total de ${prompt.suggestedCategory} se restauró automáticamente.`,
  },
};

const { primary, secondary } = COPY[prompt.noticeReason!];
```

The `noun` switch applies to all four reasons. Refund and chargeback
copy will now say `"tu transferencia"` when `operationType === 'money_transfer'`,
matching the existing `OPERATION_LABEL` discrimination. The diff for
refund/chargeback is limited to the noun and only fires on transfer
operations.

### 4. Tests (apps/api)

Per project convention (`apps/api` ships `bun:test` tests), all automated
tests live in the API package.

**`apps/api/src/mp/domain/classify-mp-status-change.test.ts`** (new, replaces
`map-mp-status.test.ts`):

- `refunded` → status `refunded`, reason `mp_refund`, invalidatesPrompt true.
- `canceled` (with any `status_detail`: `expired`, `by_payer`, `by_collector`, `canceled_by_api`) → status `canceled`, reason `mp_cancellation`, invalidatesPrompt true.
- `charged_back` + `in_process` → status `charged_back`, reason `mp_chargeback`, invalidatesPrompt true.
- `charged_back` + `settled` → status `charged_back`, reason `mp_chargeback`, invalidatesPrompt true.
- `charged_back` + `reimbursed` → status **`active`**, reason `mp_chargeback_reimbursed`, invalidatesPrompt **false**.
- `pending`, `in_process`, `authorized`, `in_mediation`, `rejected`, `approved` → returns `null`.

**`apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts`** — new cases:

1. *BRANCH 1 cancellation* — `existingTx.status='active'`, payment arrives as `canceled + by_payer`. Asserts: `UpdateTransactionStatus` called with newStatus `canceled`, newStatusDetail `by_payer`; notice created with reason `mp_cancellation` and `mpPaymentId` suffixed `:mp_cancellation`.
2. *BRANCH 1 chargeback reimbursed* — `existingTx.status='charged_back'`, `existingTx.statusDetail='in_process'`; payment arrives as `charged_back + reimbursed`. Asserts: `UpdateTransactionStatus` called with newStatus `active`, newStatusDetail `reimbursed`; notice with reason `mp_chargeback_reimbursed`.
3. *BRANCH 1 idempotency on detail change* — `existingTx.status='charged_back'`, `existingTx.statusDetail='in_process'`; payment arrives as `charged_back + in_process` (no change). Asserts: no `UpdateTransactionStatus` call, no notice.
4. *BRANCH 1 idempotency on detail change (different detail, same status)* — `existingTx.status='charged_back', statusDetail='in_process'`; payment arrives as `charged_back + settled`. Asserts: notice created with reason `mp_chargeback`, statusDetail updated to `settled`, status unchanged.
5. *BRANCH 2 cancellation discards prompt* — pending prompt for P1; payment arrives as `canceled`. Asserts: `markDiscarded(promptId, 'mp_cancellation')`.
6. *BRANCH 2 reimbursed does NOT touch prompt* — pending prompt for P1; payment arrives as `charged_back + reimbursed`. Asserts: `markDiscarded` not called, `findByMpPaymentId` may be skipped (no work to do).
7. *Regression — non-reversible status drops* — pending prompt; payment arrives as `in_process`. Asserts: no discard, no bus publish.

**`apps/api/src/transactions/use-cases/update-transaction-status.use-case.test.ts`** (replaces `mark-transaction-reversed.use-case.test.ts`):

- Calls `repo.updateStatus` with the supplied id, status, statusDetail and clock-derived timestamp.

**Repository test** — `json-transactions.repository.test.ts` already exists; add a case asserting `updateStatus` persists `statusDetail` to disk and reads it back.

**Fakes** — `apps/api/src/shared/testing/fakes.ts:60` typed `updateStatus(id, newStatus, at)`. Signature change ripples here: add `newStatusDetail` parameter.

### 5. Manual verification (UI)

Full stack up (api, ui, ai, cloudflared tunnel). For each scenario, wait one
poll tick after the MP state change.

1. **Cancellation post-settlement.** Sandbox payment → `approved` → confirm
   prompt → confirm via UI → transaction created. Cancel from MP panel.
   Expect row badge `"Cancelada"`, notice card `"Mercado Pago canceló tu
   pago/transferencia a {X}..."`.
2. **Pre-settlement cancellation (silent drop).** Create a payment, keep it
   in `pending`. Cancel from MP. Expect no notice, no transaction.
3. **Cancellation while prompt pending.** Sandbox payment → `approved` →
   prompt arrives → do NOT confirm. Cancel from MP. Expect prompt to
   disappear (no notice card — silent discard).
4. **Chargeback in process.** Sandbox payment → `approved` → confirm →
   open a dispute. Expect row badge `"Contracargo"`, notice card
   `"Mercado Pago revirtió tu pago/transferencia..."`.
5. **Chargeback reimbursed (seller wins).** Continue from (4). Mark the
   dispute resolved in favor of the seller (`status_detail: reimbursed`).
   Expect the transaction row to **lose** the `"Contracargo"` badge and a
   notice card `"Mercado Pago resolvió el contracargo a tu favor..."`.

## Edge cases

- **Reimbursed without prior charged_back recorded in Gasti.** Possible only
  if the user connected MP after the dispute started but before resolution.
  BRANCH 1 won't see a matching transaction; BRANCH 2 with `invalidatesPrompt=false`
  drops silently. Outcome: no notice, no transaction. Acceptable — we never
  had that movement on file.
- **Multiple notices per payment.** A single payment can produce up to four
  notices over its lifetime (`refund`, `chargeback`, `chargeback_reimbursed`,
  `cancellation` — though not all combinations are reachable in practice).
  The `mpPaymentId` key on the notice carries a reason suffix to keep them
  distinct.
- **Operation type unknown / null.** `noun` falls back to `pago` for any
  non-`money_transfer` operation, including null and legacy rows. Matches
  the previous copy for those rows.
- **`statusChangedAt` semantics.** Already updates whenever status changes;
  no change. When only `statusDetail` changes (same `status`), this field
  also bumps because `UpdateTransactionStatus` updates the timestamp
  unconditionally.

## Open questions / known inconsistencies

- **Spending calculation ignores transaction status.** `apps/api/src/spending`
  does not filter out `refunded`, `charged_back`, or `canceled` transactions
  today; they all count toward spending totals. The notice line `"ya no
  cuenta en tus totales"` is aspirational, not literal. Pre-existing bug.
  Surfaced but not fixed by this spec.
- **Partial refunds.** Out of scope here. The amount displayed for
  `approved + partially_refunded` is wrong (it shows the full
  `transaction_amount`). Separate spec needed because the design touches
  `transactions.refunds[]` ingestion and amount reconciliation.

## Out of scope

- Filtering by status in spending/insights.
- Partial refunds (separate spec).
- `in_mediation` notifications (informational, deferred).
- Backwards-compatible migration of `data/transactions.json` — none
  required: `canceled` and `statusDetail` are additive, defaults cover
  legacy rows.
- Retro-applying operation-type-aware copy to confirmation prompts. Only
  the notice card is touched here.
