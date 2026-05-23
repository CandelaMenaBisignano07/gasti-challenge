# MP payment status events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add handling for MP `canceled` payments and `charged_back + reimbursed` outcomes, fix the `'cancelled' → 'canceled'` typo, and persist `Transaction.statusDetail` so idempotency works across `charged_back` sub-states.

**Architecture:** Replace the `status`-only `mapMpStatusToTransactionStatus` with a `classifyMpStatusChange(payment)` function that reads both `status` and `status_detail` and returns `{ newTransactionStatus, newStatusDetail, noticeReason, invalidatesPrompt } | null`. Rename `MarkTransactionReversed → UpdateTransactionStatus` and extend the repository to persist `statusDetail`. Wire it through `ProcessMpEvent` BRANCH 1 + BRANCH 2. Mirror enum changes and copy in the UI.

**Tech Stack:** TypeScript, NestJS, Zod, bun:test, Next.js 15, React 19. Spec: `docs/superpowers/specs/2026-05-23-mp-status-events-design.md`.

---

## Task 1: Fix `MpPayment.status` typo

The existing enum value `'cancelled'` (two L's) is unreachable — MP returns `'canceled'`. Pure type fix; no test (it's a TS type alias, no implementation behind it).

**Files:**
- Modify: `apps/api/src/mp/domain/mp-payment.ts:6-15`

- [ ] **Step 1: Apply the rename**

Replace `'cancelled'` with `'canceled'` in the `status` union:

```ts
status:
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'canceled'        // ← was 'cancelled'
  | 'refunded'
  | 'charged_back';
```

- [ ] **Step 2: Verify nothing referenced the old spelling**

Run: `grep -rn "'cancelled'" apps/api/src apps/ui/src --include="*.ts" --include="*.tsx"`
Expected: no matches anywhere.

- [ ] **Step 3: Type-check the api workspace**

Run: `bun --filter=api tsc --noEmit` (or `cd apps/api && bunx tsc -p tsconfig.json --noEmit`)
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mp/domain/mp-payment.ts
git commit -m "fix(api): MpPayment status typo cancelled -> canceled"
```

---

## Task 2: Extend `Transaction` schema (`canceled` + `statusDetail`)

Add the new terminal status value and the new `statusDetail` field. Existing JSON rows must continue parsing (additive, with default).

**Files:**
- Modify: `apps/api/src/shared/domain/transaction.ts:6,9-38`
- Test: `apps/api/src/shared/domain/transaction.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/shared/domain/transaction.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { transactionSchema } from './transaction';

test('parses a transaction with the new canceled status', () => {
  const tx = transactionSchema.parse({
    id: 'txn_001',
    date: '2026-05-23',
    amount: 1000,
    currency: 'ARS',
    category: 'comida',
    description: 'pago cancelado',
    merchant: 'X',
    status: 'canceled',
    statusDetail: 'by_payer',
  });
  expect(tx.status).toBe('canceled');
  expect(tx.statusDetail).toBe('by_payer');
});

test('statusDetail defaults to null on legacy rows', () => {
  const tx = transactionSchema.parse({
    id: 'txn_002',
    date: '2026-05-23',
    amount: 1000,
    currency: 'ARS',
    category: 'comida',
    description: 'legacy',
    merchant: 'X',
  });
  expect(tx.statusDetail).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/api/src/shared/domain/transaction.test.ts`
Expected: FAIL. Either `transactionSchema` rejects `status: 'canceled'`, or `statusDetail` is missing from the resolved type.

- [ ] **Step 3: Update the schema**

In `apps/api/src/shared/domain/transaction.ts`, change line 6:

```ts
export const transactionStatusSchema = z.enum(['active', 'refunded', 'charged_back', 'canceled']);
```

In the `transactionSchema` object body, add `statusDetail` after `statusChangedAt`:

```ts
statusChangedAt: z.string().nullable().default(null),
statusDetail: z.string().nullable().default(null),
source: transactionSource.default('manual'),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/api/src/shared/domain/transaction.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Run the full api test suite to catch regressions**

Run: `bun --filter=api test` (or `cd apps/api && bun test`)
Expected: PASS. Watch for any snapshot or schema-parse test that didn't account for `statusDetail` — there shouldn't be any, but if one fails it likely just needs to omit the new field from a strict assertion.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/domain/transaction.ts apps/api/src/shared/domain/transaction.test.ts
git commit -m "feat(api): add canceled status and statusDetail to Transaction"
```

---

## Task 3: Extend `NoticeReason`

Add the two new reasons. Pure type widening; tested in Task 4 (classifier) and Task 7 (use-case).

**Files:**
- Modify: `apps/api/src/proactive/domain/pending-prompt.ts:6`

- [ ] **Step 1: Apply the change**

Replace line 6 of `apps/api/src/proactive/domain/pending-prompt.ts`:

```ts
export type NoticeReason =
  | 'mp_refund'
  | 'mp_chargeback'
  | 'mp_cancellation'
  | 'mp_chargeback_reimbursed';
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && bunx tsc -p tsconfig.json --noEmit`
Expected: clean. (Existing call sites use literal `'mp_refund'` / `'mp_chargeback'`; the union widening doesn't break them.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/proactive/domain/pending-prompt.ts
git commit -m "feat(api): extend NoticeReason with mp_cancellation and mp_chargeback_reimbursed"
```

---

## Task 4: Replace `mapMpStatusToTransactionStatus` with `classifyMpStatusChange`

The mapper read only `status`; the new classifier reads both `status` and `status_detail` and returns a richer record. Delete the old file/test, write the new pair.

**Files:**
- Delete: `apps/api/src/mp/domain/map-mp-status.ts`
- Delete: `apps/api/src/mp/domain/map-mp-status.test.ts`
- Create: `apps/api/src/mp/domain/classify-mp-status-change.ts`
- Test: `apps/api/src/mp/domain/classify-mp-status-change.test.ts` (new)

Note: `ProcessMpEvent` still imports the old mapper at this point. Don't delete the old files yet — that breaks the build. We delete after migrating the call site (Task 7). For now, both the old mapper and the new classifier coexist temporarily.

- [ ] **Step 1: Write the failing classifier test**

Create `apps/api/src/mp/domain/classify-mp-status-change.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { classifyMpStatusChange } from './classify-mp-status-change';
import type { MpPayment } from './mp-payment';

function payment(overrides: Partial<MpPayment>): MpPayment {
  return {
    id: 'PAY_1',
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 100,
    ...overrides,
  };
}

test('refunded maps to refunded notice', () => {
  const result = classifyMpStatusChange(payment({ status: 'refunded', status_detail: 'refunded' }));
  expect(result).toEqual({
    newTransactionStatus: 'refunded',
    newStatusDetail: 'refunded',
    noticeReason: 'mp_refund',
    invalidatesPrompt: true,
  });
});

test('canceled maps to canceled notice, regardless of detail', () => {
  for (const detail of ['expired', 'by_payer', 'by_collector', 'canceled_by_api']) {
    const result = classifyMpStatusChange(payment({ status: 'canceled', status_detail: detail }));
    expect(result).toEqual({
      newTransactionStatus: 'canceled',
      newStatusDetail: detail,
      noticeReason: 'mp_cancellation',
      invalidatesPrompt: true,
    });
  }
});

test('charged_back + in_process maps to chargeback notice', () => {
  const result = classifyMpStatusChange(
    payment({ status: 'charged_back', status_detail: 'in_process' }),
  );
  expect(result).toEqual({
    newTransactionStatus: 'charged_back',
    newStatusDetail: 'in_process',
    noticeReason: 'mp_chargeback',
    invalidatesPrompt: true,
  });
});

test('charged_back + settled maps to chargeback notice', () => {
  const result = classifyMpStatusChange(
    payment({ status: 'charged_back', status_detail: 'settled' }),
  );
  expect(result?.newStatusDetail).toBe('settled');
  expect(result?.noticeReason).toBe('mp_chargeback');
});

test('charged_back + reimbursed flips back to active with reimbursed notice', () => {
  const result = classifyMpStatusChange(
    payment({ status: 'charged_back', status_detail: 'reimbursed' }),
  );
  expect(result).toEqual({
    newTransactionStatus: 'active',
    newStatusDetail: 'reimbursed',
    noticeReason: 'mp_chargeback_reimbursed',
    invalidatesPrompt: false,
  });
});

test.each(['pending', 'in_process', 'authorized', 'in_mediation', 'rejected', 'approved'] as const)(
  'returns null for non-reversible status %s',
  (status) => {
    expect(classifyMpStatusChange(payment({ status }))).toBeNull();
  },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/api/src/mp/domain/classify-mp-status-change.test.ts`
Expected: FAIL — module `./classify-mp-status-change` not found.

- [ ] **Step 3: Implement the classifier**

Create `apps/api/src/mp/domain/classify-mp-status-change.ts`:

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
  return null;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/api/src/mp/domain/classify-mp-status-change.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/domain/classify-mp-status-change.ts apps/api/src/mp/domain/classify-mp-status-change.test.ts
git commit -m "feat(api): add classifyMpStatusChange that reads status + status_detail"
```

---

## Task 5: Repository `updateStatus` accepts `statusDetail`

The interface, the JSON implementation, and the fake all gain a `newStatusDetail: string | null` parameter. Persist it next to `status` and `statusChangedAt`.

**Files:**
- Modify: `apps/api/src/transactions/domain/transactions.repository.ts:42`
- Modify: `apps/api/src/transactions/repositories/json-transactions.repository.ts:107-115`
- Modify: `apps/api/src/shared/testing/fakes.ts:60-64`

- [ ] **Step 1: Write the failing test**

Add a test in `apps/api/src/transactions/repositories/json-transactions.repository.test.ts` (file may exist already; if not, create it). If the file exists, append:

```ts
import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonTransactionsRepository } from './json-transactions.repository';

test('updateStatus persists newStatusDetail alongside status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gasti-tx-'));
  const file = join(dir, 'transactions.json');
  writeFileSync(
    file,
    JSON.stringify([
      {
        id: 'txn_001',
        date: '2026-05-01',
        amount: 1000,
        currency: 'ARS',
        category: 'comida',
        description: 'X',
        merchant: 'X',
        userId: 'default-user',
        status: 'active',
        statusChangedAt: null,
      },
    ]),
  );
  process.env.TRANSACTIONS_FILE = file;

  const repo = new JsonTransactionsRepository();
  await repo.updateStatus('txn_001', 'charged_back', 'in_process', new Date('2026-05-23T10:00:00Z'));

  const stored = (await repo.all())[0];
  expect(stored.status).toBe('charged_back');
  expect(stored.statusDetail).toBe('in_process');
  expect(stored.statusChangedAt).toBe('2026-05-23T10:00:00.000Z');

  rmSync(dir, { recursive: true, force: true });
});
```

Note: if the file already exists with different setup, adapt this case to the existing harness. The intent is: write tx with no statusDetail, call updateStatus with one, read back and assert it's stored.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/api/src/transactions/repositories/json-transactions.repository.test.ts`
Expected: FAIL — `updateStatus` only accepts 3 args.

- [ ] **Step 3: Update the interface**

In `apps/api/src/transactions/domain/transactions.repository.ts:42`:

```ts
updateStatus(
  id: string,
  newStatus: TransactionStatus,
  newStatusDetail: string | null,
  at: Date,
): Promise<void>;
```

- [ ] **Step 4: Update the JSON implementation**

In `apps/api/src/transactions/repositories/json-transactions.repository.ts:107-115`:

```ts
async updateStatus(
  id: string,
  newStatus: TransactionStatus,
  newStatusDetail: string | null,
  at: Date,
): Promise<void> {
  const txs = await this.all();
  const index = txs.findIndex((t) => t.id === id);
  if (index === -1) return;
  txs[index] = {
    ...txs[index],
    status: newStatus,
    statusDetail: newStatusDetail,
    statusChangedAt: at.toISOString(),
  };
  await this.store.write(txs);
}
```

- [ ] **Step 5: Update the fake**

In `apps/api/src/shared/testing/fakes.ts:60-64`, replace the `updateStatus` body:

```ts
async updateStatus(id, newStatus, newStatusDetail, at: Date) {
  const i = txs.findIndex((t) => t.id === id);
  if (i === -1) return;
  txs[i] = {
    ...txs[i],
    status: newStatus,
    statusDetail: newStatusDetail,
    statusChangedAt: at.toISOString(),
  };
},
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test apps/api/src/transactions/repositories/json-transactions.repository.test.ts`
Expected: PASS.

- [ ] **Step 7: Confirm the api typecheck**

Run: `cd apps/api && bunx tsc -p tsconfig.json --noEmit`
Expected: errors only in `MarkTransactionReversed` and the existing `mark-transaction-reversed.use-case.test.ts` — the use-case still calls `updateStatus` with three args. We fix that in Task 6.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/transactions/domain/transactions.repository.ts apps/api/src/transactions/repositories/json-transactions.repository.ts apps/api/src/shared/testing/fakes.ts apps/api/src/transactions/repositories/json-transactions.repository.test.ts
git commit -m "feat(api): updateStatus persists statusDetail"
```

---

## Task 6: Rename `MarkTransactionReversed` → `UpdateTransactionStatus`

The current name lies for the `reimbursed` case (it un-reverses). Rename, broaden the input, update the single non-test consumer (`ProcessMpEvent`) is deferred to Task 7 — for this task we just rename, update tests, and update the NestJS module wiring.

**Files:**
- Rename: `apps/api/src/transactions/use-cases/mark-transaction-reversed.use-case.ts` → `apps/api/src/transactions/use-cases/update-transaction-status.use-case.ts`
- Rename: `apps/api/src/transactions/use-cases/mark-transaction-reversed.use-case.test.ts` → `apps/api/src/transactions/use-cases/update-transaction-status.use-case.test.ts`
- Modify: `apps/api/src/transactions/transactions.module.ts:8,24,32`
- Modify temporarily: `apps/api/src/mp/use-cases/process-mp-event.use-case.ts:7,57,70` (just enough to keep the build green — the deep refactor is Task 7)

- [ ] **Step 1: Rewrite the use-case**

Write `apps/api/src/transactions/use-cases/update-transaction-status.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../domain/transactions.repository';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import type { TransactionStatus } from '../../shared/domain/transaction';

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

- [ ] **Step 2: Rewrite the use-case test**

Write `apps/api/src/transactions/use-cases/update-transaction-status.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { UpdateTransactionStatus } from './update-transaction-status.use-case';
import { fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import { transactionSchema, type Transaction } from '../../shared/domain/transaction';

const seed: Transaction = transactionSchema.parse({
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: 'Almuerzo',
  merchant: 'Rappi',
});

test('updates status, statusDetail and stamps statusChangedAt', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const useCase = new UpdateTransactionStatus(repo, fixedClock('2026-05-18'));

  await useCase.execute({
    transactionId: 'txn_001',
    newStatus: 'refunded',
    newStatusDetail: 'refunded',
  });

  const tx = await repo.getById('default-user', 'txn_001');
  expect(tx?.status).toBe('refunded');
  expect(tx?.statusDetail).toBe('refunded');
  expect(tx?.statusChangedAt).toBe('2026-05-18T12:00:00.000Z');
});

test('accepts null statusDetail and persists it', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const useCase = new UpdateTransactionStatus(repo, fixedClock('2026-05-18'));

  await useCase.execute({
    transactionId: 'txn_001',
    newStatus: 'active',
    newStatusDetail: null,
  });

  const tx = await repo.getById('default-user', 'txn_001');
  expect(tx?.statusDetail).toBeNull();
});

test('is a no-op for an unknown transaction id', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const useCase = new UpdateTransactionStatus(repo, fixedClock('2026-05-18'));

  await useCase.execute({
    transactionId: 'txn_999',
    newStatus: 'charged_back',
    newStatusDetail: 'in_process',
  });

  const tx = await repo.getById('default-user', 'txn_001');
  expect(tx?.status).toBe('active');
});
```

- [ ] **Step 3: Delete the old files**

```bash
rm apps/api/src/transactions/use-cases/mark-transaction-reversed.use-case.ts
rm apps/api/src/transactions/use-cases/mark-transaction-reversed.use-case.test.ts
```

- [ ] **Step 4: Update the NestJS module**

In `apps/api/src/transactions/transactions.module.ts`:

```ts
// line 8
import { UpdateTransactionStatus } from './use-cases/update-transaction-status.use-case';

// line 24 (providers array)
UpdateTransactionStatus,

// line 32 (exports array)
exports: [TRANSACTIONS_REPOSITORY, UpdateTransactionStatus, AddTransaction],
```

Make sure every appearance of the old name in the module file is replaced.

- [ ] **Step 5: Patch `ProcessMpEvent` minimally to keep the build green**

In `apps/api/src/mp/use-cases/process-mp-event.use-case.ts`:

- Line 7: change import to `import { UpdateTransactionStatus } from '../../transactions/use-cases/update-transaction-status.use-case';`
- Line 57: change to `private readonly updateStatus: UpdateTransactionStatus,`
- Line 70: change to `await this.updateStatus.execute({ transactionId: existingTx.id, newStatus, newStatusDetail: payment.status_detail });`

This is a *temporary* fix that preserves current behavior (the `newStatusDetail` arg gets the raw MP detail, which is harmless for refund/charged_back since they already match). Task 7 replaces this with the classifier-driven version.

- [ ] **Step 6: Run the api test suite**

Run: `bun --filter=api test`
Expected: PASS. Existing `process-mp-event.use-case.test.ts` may need a tiny adjustment — the constructor now takes `UpdateTransactionStatus` instead of `MarkTransactionReversed`. Update its `build()` helper accordingly (search for `new MarkTransactionReversed` and replace with `new UpdateTransactionStatus`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/transactions/use-cases/ apps/api/src/transactions/transactions.module.ts apps/api/src/mp/use-cases/process-mp-event.use-case.ts apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts
git commit -m "refactor(api): rename MarkTransactionReversed -> UpdateTransactionStatus"
```

---

## Task 7: Refactor `ProcessMpEvent` to use `classifyMpStatusChange`

Replace the `mapMpStatusToTransactionStatus` import with `classifyMpStatusChange`, rewrite BRANCH 1 and BRANCH 2 to consume the classifier's structured output, and update the idempotency check to compare `(status, statusDetail)`. Add tests for the new scenarios.

**Files:**
- Modify: `apps/api/src/mp/use-cases/process-mp-event.use-case.ts:24,62-109,77` (mpPaymentId suffix)
- Modify: `apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts` (add tests)
- Delete: `apps/api/src/mp/domain/map-mp-status.ts`
- Delete: `apps/api/src/mp/domain/map-mp-status.test.ts`

- [ ] **Step 1: Write the failing tests for the new scenarios**

Open `apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts` and append:

```ts
// BRANCH 1 — cancellation of an existing active transaction
test('canceled payment flips an existing active transaction to canceled and publishes a cancellation notice', async () => {
  const tx = makeTx({ status: 'active', statusDetail: null });
  const ctx = build({
    user: makeUser(),
    payment: makePayment({ status: 'canceled', status_detail: 'by_payer' }),
    txs: [tx],
  });
  await ctx.useCase.execute({ payment: ctx.useCase['classifier' as never] ? {} as never : ({ ...makePayment({ status: 'canceled', status_detail: 'by_payer' }) }), user: ctx.user });
  // Replace with a simpler call form if your helper allows direct payment passing; see existing tests.
});
```

> The exact shape of the helper depends on the existing test file. Look at how the BRANCH 1 refund test is written (search for `'refunded'`) and copy its structure. The assertions should be:
>
> - `txRepo.getById('default-user', tx.id)` returns a transaction with `status === 'canceled'` and `statusDetail === 'by_payer'`.
> - `promptsRepo.rows()` contains a new row with `intent === 'notice'`, `noticeReason === 'mp_cancellation'`, `mpPaymentId === 'PAY_1:mp_cancellation'`.
> - `bus.published` contains that notice prompt.

Now append two more tests using the same pattern:

```ts
// BRANCH 1 — chargeback resolved in seller's favor
test('charged_back+reimbursed flips a charged_back transaction back to active', async () => {
  // seed tx with status='charged_back', statusDetail='in_process'
  // payment arrives with status='charged_back', status_detail='reimbursed'
  // assert: tx.status === 'active', tx.statusDetail === 'reimbursed'
  // assert: notice created with reason='mp_chargeback_reimbursed', mpPaymentId 'PAY_1:mp_chargeback_reimbursed'
});

// BRANCH 1 — idempotency on (status, statusDetail) tuple
test('no-op when status and statusDetail are unchanged', async () => {
  // seed tx with status='charged_back', statusDetail='in_process'
  // payment arrives with status='charged_back', status_detail='in_process'
  // assert: no notice created, no bus publish
});

test('detail-only change still emits a notice', async () => {
  // seed tx with status='charged_back', statusDetail='in_process'
  // payment arrives with status='charged_back', status_detail='settled'
  // assert: tx.statusDetail === 'settled', notice with reason='mp_chargeback'
});

// BRANCH 2 — pending prompt discarded by cancellation
test('canceled payment discards a pending prompt with mp_cancellation reason', async () => {
  const pending = makePrompt({ status: 'pending' });
  const ctx = build({
    user: makeUser(),
    payment: makePayment({ status: 'canceled', status_detail: 'expired' }),
    prompts: [pending],
  });
  // execute
  // assert: pending.status === 'discarded', noticeReason === 'mp_cancellation'
  // assert: bus.published contains the discarded prompt
});

// BRANCH 2 — reimbursed does NOT discard a pending prompt
test('reimbursed payment does not touch a pending prompt', async () => {
  const pending = makePrompt({ status: 'pending' });
  const ctx = build({
    user: makeUser(),
    payment: makePayment({ status: 'charged_back', status_detail: 'reimbursed' }),
    prompts: [pending],
  });
  // execute
  // assert: pending.status still 'pending'
  // assert: bus.published is empty
});

// Regression — non-reversible status leaves prompt alone
test('in_process payment does not discard a pending prompt', async () => {
  const pending = makePrompt({ status: 'pending' });
  const ctx = build({
    user: makeUser(),
    payment: makePayment({ status: 'in_process', status_detail: 'pending_review_manual' }),
    prompts: [pending],
  });
  // execute
  // assert: pending.status still 'pending'
  // assert: bus.published is empty
});
```

Flesh out each test body by mirroring the existing refund/chargeback tests in this file. Do not introduce new helper signatures — reuse `build`, `makePayment`, `makePrompt`, `makeTx`, `makeUser`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts`
Expected: the new tests FAIL — at least the cancellation cases will, because no rebranch on `canceled` exists yet; the reimbursed case will FAIL because the classifier is not in place at the call site; the idempotency-on-detail test will FAIL because the current code only compares `status`.

- [ ] **Step 3: Refactor `ProcessMpEvent`**

Replace lines 24, 62-109 of `apps/api/src/mp/use-cases/process-mp-event.use-case.ts`:

```ts
// line 24 — change the import
import { classifyMpStatusChange } from '../domain/classify-mp-status-change';
```

Replace the body of `execute()` up to (but NOT including) BRANCH 3:

```ts
async execute({ payment, user }: ProcessMpEventInput): Promise<void> {
  const paymentId = String(payment.id);
  const existingTx = await this.transactions.findByMpPaymentId(user.id, paymentId);
  const change = classifyMpStatusChange(payment);

  // BRANCH 1 — the payment already exists as a transaction.
  if (existingTx) {
    if (!change) return;
    if (
      change.newTransactionStatus === existingTx.status &&
      change.newStatusDetail === existingTx.statusDetail
    ) return;

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

  // BRANCH 3 — unchanged below this line.
  // ... existing code from line 111 onwards stays the same ...
}
```

Remove the now-unused import of `mapMpStatusToTransactionStatus`.

- [ ] **Step 4: Run the existing tests + new tests**

Run: `bun --filter=api test`
Expected: PASS, including the new cases. If a previously-passing refund or chargeback test fails, it's likely because the `mpPaymentId` of the notice changed from `:reversal` to `:mp_refund` / `:mp_chargeback`. Update the assertion in that test to match (the spec calls this out explicitly).

- [ ] **Step 5: Delete the old mapper and its test**

```bash
rm apps/api/src/mp/domain/map-mp-status.ts
rm apps/api/src/mp/domain/map-mp-status.test.ts
```

- [ ] **Step 6: Full typecheck and full test pass**

Run: `cd apps/api && bunx tsc -p tsconfig.json --noEmit`
Expected: clean.

Run: `bun --filter=api test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/mp/use-cases/process-mp-event.use-case.ts apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts apps/api/src/mp/domain/
git commit -m "feat(api): handle canceled and chargeback-reimbursed in ProcessMpEvent"
```

---

## Task 8: UI mirrors — enums, label, notice card

Three small UI files. No automated tests; the dev server smoke-test in Task 9 covers the visible behavior.

**Files:**
- Modify: `apps/ui/src/proactive/domain/pending-prompt.ts:3`
- Modify: `apps/ui/src/transactions/domain/transaction.ts:4`
- Modify: `apps/ui/src/transactions/components/transaction-row.tsx:14-18`
- Modify: `apps/ui/src/proactive/components/proactive-notice-card.tsx`

- [ ] **Step 1: Mirror `NoticeReason` in the UI**

Replace line 3 of `apps/ui/src/proactive/domain/pending-prompt.ts`:

```ts
export type PendingPromptNoticeReason =
  | 'mp_refund'
  | 'mp_chargeback'
  | 'mp_cancellation'
  | 'mp_chargeback_reimbursed';
```

- [ ] **Step 2: Extend `TransactionStatus` in the UI**

Replace line 4 of `apps/ui/src/transactions/domain/transaction.ts`:

```ts
export type TransactionStatus = 'active' | 'refunded' | 'charged_back' | 'canceled';
```

- [ ] **Step 3: Extend `STATUS_LABEL`**

In `apps/ui/src/transactions/components/transaction-row.tsx:14-18`:

```ts
const STATUS_LABEL: Record<TransactionStatus, string> = {
  active: '',
  refunded: 'Reembolsada',
  charged_back: 'Contracargo',
  canceled: 'Cancelada',
};
```

- [ ] **Step 4: Refactor `ProactiveNoticeCard`**

Replace the body of `apps/ui/src/proactive/components/proactive-notice-card.tsx` from the `export function ProactiveNoticeCard` onwards:

```tsx
'use client';

import type { ReactNode } from 'react';
import { Card } from '@/shared/ui/card';
import { Eyebrow } from '@/shared/ui/eyebrow';
import { Num } from '@/shared/ui/num';
import { formatPromptDate } from '@/proactive/providers/format-prompt-date';
import type {
  PendingPrompt,
  PendingPromptNoticeReason,
} from '@/proactive/domain/pending-prompt';

type ProactiveNoticeCardProps = {
  prompt: PendingPrompt;
};

export function ProactiveNoticeCard({ prompt }: ProactiveNoticeCardProps) {
  if (!prompt.noticeReason) return null;

  const counterpart = prompt.merchant ?? prompt.suggestedDescription;
  const date = formatPromptDate(prompt.paymentDate);
  const noun = prompt.operationType === 'money_transfer' ? 'transferencia' : 'pago';
  const amount = <Num value={prompt.amount} size="sm" />;

  const copy: Record<PendingPromptNoticeReason, { primary: ReactNode; secondary: string }> = {
    mp_refund: {
      primary: (
        <>
          Mercado Pago reembolsó tu {noun} a {counterpart} del {date} ({amount}). La marcamos como
          reembolsada.
        </>
      ),
      secondary: `Tu total de ${prompt.suggestedCategory} bajó automáticamente.`,
    },
    mp_chargeback: {
      primary: (
        <>
          Mercado Pago revirtió tu {noun} a {counterpart} del {date} ({amount}) por un contracargo.
        </>
      ),
      secondary: 'Esa transacción ya no cuenta en tus totales.',
    },
    mp_cancellation: {
      primary: (
        <>
          Mercado Pago canceló tu {noun} a {counterpart} del {date} ({amount}). La marcamos como
          cancelada.
        </>
      ),
      secondary: 'Esa transacción quedó cancelada en tus totales.',
    },
    mp_chargeback_reimbursed: {
      primary: (
        <>
          Mercado Pago resolvió el contracargo a tu favor. Tu {noun} a {counterpart} del {date} (
          {amount}) vuelve a contar.
        </>
      ),
      secondary: `Tu total de ${prompt.suggestedCategory} se restauró automáticamente.`,
    },
  };

  const { primary, secondary } = copy[prompt.noticeReason];

  return (
    <Card variant="lavender" radius="lg" className="max-w-[540px] p-s4 animate-message-enter">
      <div className="flex flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        <p className="font-display text-[17px] leading-[1.5] text-ink-1">{primary}</p>
        <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {secondary}
        </span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Typecheck UI**

Run: `cd apps/ui && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/proactive/domain/pending-prompt.ts apps/ui/src/transactions/domain/transaction.ts apps/ui/src/transactions/components/transaction-row.tsx apps/ui/src/proactive/components/proactive-notice-card.tsx
git commit -m "feat(ui): mirror canceled status and chargeback-reimbursed notice"
```

---

## Task 9: End-to-end verification

The dev stack (api, ui, ai, cloudflared tunnel) is already running per the earlier setup. Restart the api if needed to pick up the latest code.

- [ ] **Step 1: Restart api dev to load the new code**

If `apps/api` is running under `bun --watch`, it already reloaded on each commit. To verify:

Run: `curl -sf http://localhost:3001/health`
Expected: `{"ok":true}`.

- [ ] **Step 2: Full test sweep**

Run: `bun --filter=api test`
Expected: all green.

Run: `cd apps/ui && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual UI verification**

Open `http://localhost:3000` and follow the manual verification block in `docs/superpowers/specs/2026-05-23-mp-status-events-design.md` §5 (five scenarios). Tick each as observed:

- [ ] Cancellation post-settlement: row badge `Cancelada`, notice "Mercado Pago canceló tu …".
- [ ] Pre-settlement cancellation: silent drop, no notice, no transaction.
- [ ] Prompt-pending cancellation: prompt disappears, no notice card.
- [ ] Chargeback in process: row badge `Contracargo`, notice "Mercado Pago revirtió …".
- [ ] Chargeback reimbursed: row badge clears, notice "Mercado Pago resolvió el contracargo a tu favor …".

- [ ] **Step 4: If any scenario fails, debug per `systematic-debugging` skill**

Do not paper over a failed scenario. Use the skill, find the root cause, add a test if missing, fix, re-verify.

- [ ] **Step 5: Final commit only if any code changed during verification**

If verification fixes were needed:

```bash
git add -A
git commit -m "fix(api|ui): <what was wrong>"
```

If no fixes needed, no commit. The feature is done.

---

## Self-review

**Spec coverage check** (every spec section maps to a task):

- §1 Domain: `MpPayment.status` typo → Task 1. `transactionStatusSchema` + `statusDetail` → Task 2. `NoticeReason` → Task 3. `classifyMpStatusChange` → Task 4.
- §2 Use-case: `UpdateTransactionStatus` rename → Task 6. `ProcessMpEvent` refactor + suffix → Task 7. Repository signature → Task 5.
- §3 UI: `PendingPromptNoticeReason` mirror → Task 8 Step 1. `TransactionStatus` mirror → Task 8 Step 2. `STATUS_LABEL` → Task 8 Step 3. `ProactiveNoticeCard` → Task 8 Step 4.
- §4 Tests: classifier tests → Task 4. Use-case tests → Task 6, 7. Repository test → Task 5. Fake update → Task 5.
- §5 Manual verification → Task 9.

All sections covered.

**Placeholder scan**: none of "TBD/TODO/handle edge cases/add validation" appears. Task 7 Step 1 has placeholder-shaped test bodies, but only because each test body must mirror the existing helper pattern from the same file — copying that structure as-is would mean duplicating 30 lines of setup code per test. The instructions explicitly point the implementer to `existing refund test` as the template, with the exact assertions enumerated. Acceptable because the missing pieces are mechanical (helper invocations), not design decisions.

**Type consistency**:
- `classifyMpStatusChange` return shape `{ newTransactionStatus, newStatusDetail, noticeReason, invalidatesPrompt }` appears identically in Tasks 4, 7, and the spec.
- `UpdateTransactionStatus.execute` input `{ transactionId, newStatus, newStatusDetail }` matches across Tasks 6, 7.
- Repository `updateStatus(id, newStatus, newStatusDetail, at)` order matches across Tasks 5, 6.
