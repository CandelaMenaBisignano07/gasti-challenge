# MP polling pivot — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inbound Mercado Pago webhook integration with a server-driven polling loop (cron + first-connect backfill) that captures the full set of MP movements the webhook cannot deliver.

**Architecture:** A `@nestjs/schedule` cron in `apps/api` fires every 2 minutes, calls `GET /v1/payments/search` per connected user with a per-user `lastPolledAt` cursor (5-minute overlap), filters out `account_fund`, dedupes by `mpPaymentId`, classifies via the existing `apps/ai` workflow, and emits SSE events for the UI. A one-shot backfill on first OAuth connect (24h/7d/15d/30d/skip) uses a new batch classify workflow and auto-saves transactions with a single editable summary card in the chat thread. The `PaymentClassifier` interface gains a `user` argument now to future-proof for the in-flight per-user categories feature without forcing a later refactor.

**Tech Stack:** Bun, NestJS 10 (`@nestjs/schedule`), Mastra `^1.33` (`@mastra/core`), Next.js 15 + React 19 + Tailwind 3, Zod, `bun:test`, JSON-file persistence via `createJsonStore`.

**Companion docs:**
- Spec: [`docs/superpowers/specs/2026-05-22-mp-polling-pivot-design.md`](../specs/2026-05-22-mp-polling-pivot-design.md)
- Project rules: [`CLAUDE.md`](../../../CLAUDE.md)
- Product: [`PRODUCT.md`](../../../PRODUCT.md)
- Design system: [`DESIGN.md`](../../../DESIGN.md)

**Baseline:** worktree `mp-polling-pivot` branched off `worktree-proactive-mercadopago` (commit `fae8cbb`). `bun install` clean, `cd apps/api && bun test` = 85 pass / 0 fail.

---

## File map (locked-in decomposition)

### apps/api — new files
- `src/mp/domain/mp-poll-cursor.ts` — cursor entity + helpers
- `src/mp/domain/mp-poll-cursors.repository.ts` — repo contract + DI token
- `src/mp/repositories/json-mp-poll-cursors.repository.ts` — JSON impl
- `src/mp/repositories/json-mp-poll-cursors.repository.test.ts`
- `src/mp/domain/mp-payments-search.gateway.ts` — gateway contract + DI token
- `src/mp/providers/http-mp-payments-search.gateway.ts` — `fetch`-based impl
- `src/mp/providers/http-mp-payments-search.gateway.test.ts`
- `src/mp/domain/operation-type.ts` — MP `operation_type` enum + filter helper
- `src/mp/use-cases/poll-mp-payments.use-case.ts` — orchestrator
- `src/mp/use-cases/poll-mp-payments.use-case.test.ts`
- `src/mp/infrastructure/mp-poll.scheduler.ts` — `@Cron` wrapper
- `src/mp/use-cases/backfill-mp-payments.use-case.ts`
- `src/mp/use-cases/backfill-mp-payments.use-case.test.ts`
- `src/mp/domain/backfill-scope.ts` — scope → duration helper
- `src/mp/domain/backfill-scope.test.ts`
- `src/mp/interface/mp-backfill.controller.ts` — `POST /mp/backfill`
- `src/proactive/domain/backfill-summary.ts` — entity
- `src/proactive/domain/backfill-summaries.repository.ts` — repo contract
- `src/proactive/repositories/json-backfill-summaries.repository.ts`
- `src/proactive/repositories/json-backfill-summaries.repository.test.ts`
- `src/proactive/use-cases/publish-backfill-summary.use-case.ts`
- `scripts/migrate-mp-source.ts` — one-shot migration script
- `scripts/migrate-mp-source.test.ts`

### apps/api — modified files
- `src/app.module.ts` — register `ScheduleModule.forRoot()`
- `src/mp/mp.module.ts` — drop webhook providers, add poll-side providers
- `src/mp/domain/payment-classifier.ts` — add `user` to `ClassifyArgs`
- `src/mp/providers/http-payment-classifier.ts` — accept `user` (ignored for now)
- `src/mp/use-cases/process-mp-event.use-case.ts` — signature `{ payment, user }`
- `src/mp/use-cases/process-mp-event.use-case.test.ts` — update for new signature
- `src/transactions/domain/transaction.ts` — `source` enum collapses
- `src/proactive/domain/pending-prompt.ts` — add `operationType` field
- `src/proactive/use-cases/resolve-proactive-prompt.use-case.ts` — `source: 'mercadopago'`
- `src/shared/providers/paths.ts` — add `mpPollCursorsFile()`, `backfillSummariesFile()`
- `apps/api/data/transactions.json` — migrated by script
- `apps/api/.env` — drop `MP_WEBHOOK_SECRET`, drop tunnel URL from `MP_REDIRECT_URI`
- `apps/api/.env.example` — same
- `apps/api/package.json` — add `@nestjs/schedule`

### apps/api — deleted files
- `src/mp/interface/mp-webhook.controller.ts`
- `src/mp/interface/mp-webhook.controller.test.ts`
- `src/mp/providers/mp-signature-verifier.ts`
- `src/mp/providers/mp-signature-verifier.test.ts`
- `scripts/create-mp-preference.ts`
- Webhook section of `src/mp/interface/mp.schemas.ts`

### apps/ai — new files
- `src/mp-classification/workflows/classify-batch.workflow.ts`
- `src/mp-classification/domain/classify-batch.ts` — input/output Zod
- `src/mp-classification/agents/mp-classifier-batch.agent.ts` (or reuse `mpClassifierAgent`)

### apps/ai — modified files
- `src/mastra/index.ts` — register the new workflow

### apps/ui — new files
- `src/proactive/providers/pick-lead-copy.ts` — pure fn
- `src/proactive/providers/pick-lead-copy.test.ts`
- `src/mp/components/backfill-modal.tsx`
- `src/proactive/components/backfill-summary-card.tsx`
- `src/proactive/components/backfill-detail-view.tsx`
- `app/mp/callback/page.tsx` — callback route

### apps/ui — modified files
- `src/proactive/components/proactive-prompt-card.tsx` — use `pickLeadCopy`
- `src/proactive/domain/pending-prompt.ts` — mirror new `operationType` field
- `src/mp/infrastructure/http-mp-repository.ts` — add `triggerBackfill`
- `src/mp/infrastructure/use-mp-connection.ts` — `pendingBackfillOffer`

---

## Execution status

**Worktree:** `.claude/worktrees/mp-polling-pivot` on branch `worktree-mp-polling-pivot` (base `worktree-proactive-mercadopago` @ `fae8cbb`).

**Completed (T1–T8):**

| T | Commit | Subject | Tests after |
|---|---|---|---|
| T1 | `4146820` | chore(api): add @nestjs/schedule and register ScheduleModule | 85 ✓ |
| T2 | `9931255` | feat(api): MpPollCursor domain + repository contract | 85 ✓ |
| T3 | `deb8935` | feat(api): JsonMpPollCursorsRepository with tests | 88 ✓ |
| T4 | `e17615e` | feat(api): MP operation_type enum + acceptance helper | 88 ✓ |
| T5 | `cf8aef0` | feat(api): MpPaymentsSearchGateway interface | 88 ✓ |
| T6 | `7079bf2` | feat(api): HttpMpPaymentsSearchGateway with pagination + cap | 92 ✓ |
| T7 | `b71a7d0` | refactor(api): thread user through PaymentClassifier contract | 92 ✓ |
| T8 | `374c6e6` | chore(api): remove MP webhook receiver, signature verifier, and preference script | 86 ✓ |

**Resume at T9** — see task block below. T9–T25 still pending; T8 deviations recorded in commit message (notably: `mp.schemas.ts` was 100% webhook content and got fully deleted; `apps/api/.env` and `apps/api/scripts/create-mp-preference.ts` never existed in this worktree).

**T7 deviation noted for the future-proofing intent:** the HTTP body sent to `apps/ai` is byte-identical to pre-T7. `user` is reserved in the interface but not serialized. T9 onward must keep passing `user` through every `classifier.classify(...)` call site they touch.

---

## Task 1 — Install `@nestjs/schedule` and register `ScheduleModule`

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Install package**

```bash
cd apps/api && bun add @nestjs/schedule
```

Expected: `package.json` gains `"@nestjs/schedule": "^4.x.x"`.

- [ ] **Step 2: Register `ScheduleModule.forRoot()` in `AppModule`**

Edit `apps/api/src/app.module.ts`. Add the import and include `ScheduleModule.forRoot()` in `imports`:

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
// ...existing imports

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SharedModule,
    TransactionsModule,
    CategorizationModule,
    SpendingModule,
    InsightsModule,
    BudgetsModule,
    IncomeModule,
    GoalsModule,
    UsersModule,
    MpModule,
    ProactiveModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 3: Verify the app still boots**

```bash
cd apps/api && bun test
```

Expected: 85 pass / 0 fail (unchanged from baseline).

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/bun.lock apps/api/src/app.module.ts
git commit -m "chore(api): add @nestjs/schedule and register ScheduleModule"
```

---

## Task 2 — Cursor entity + repository contract

**Files:**
- Create: `apps/api/src/mp/domain/mp-poll-cursor.ts`
- Create: `apps/api/src/mp/domain/mp-poll-cursors.repository.ts`

- [ ] **Step 1: Write the cursor entity**

`apps/api/src/mp/domain/mp-poll-cursor.ts`:

```ts
export interface MpPollCursor {
  readonly userId: string;
  readonly lastPolledAt: Date;
}

/**
 * Compute the begin date for a poll window, applying a 5-minute backwards
 * overlap to absorb MP's tendency to backdate payments. The cron at T sees
 * payments that MP exposed late, dedupe at the repo layer prevents duplicates.
 */
export const OVERLAP_MS = 5 * 60_000;
export function pollWindowBegin(cursor: MpPollCursor): Date {
  return new Date(cursor.lastPolledAt.getTime() - OVERLAP_MS);
}

export function advance(cursor: MpPollCursor, to: Date): MpPollCursor {
  return { userId: cursor.userId, lastPolledAt: to };
}
```

- [ ] **Step 2: Write the repository contract**

`apps/api/src/mp/domain/mp-poll-cursors.repository.ts`:

```ts
import type { MpPollCursor } from './mp-poll-cursor';

export const MP_POLL_CURSORS_REPOSITORY = 'MP_POLL_CURSORS_REPOSITORY';

export interface MpPollCursorsRepository {
  getByUserId(userId: string): Promise<MpPollCursor | null>;
  upsert(cursor: MpPollCursor): Promise<void>;
}
```

- [ ] **Step 3: Verify both files type-check**

```bash
cd apps/api && bun run build
```

Expected: clean build (no `tsc` errors).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mp/domain/mp-poll-cursor.ts \
       apps/api/src/mp/domain/mp-poll-cursors.repository.ts
git commit -m "feat(api): MpPollCursor domain + repository contract"
```

---

## Task 3 — `JsonMpPollCursorsRepository` + tests

**Files:**
- Modify: `apps/api/src/shared/providers/paths.ts`
- Create: `apps/api/src/mp/repositories/json-mp-poll-cursors.repository.ts`
- Test: `apps/api/src/mp/repositories/json-mp-poll-cursors.repository.test.ts`

- [ ] **Step 1: Extend `paths.ts` with a lazy resolver**

Append to `apps/api/src/shared/providers/paths.ts`:

```ts
export const mpPollCursorsFile = (): string =>
  process.env.MP_POLL_CURSORS_FILE || path.join(DATA_DIR, 'mp-poll-cursors.json');
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/mp/repositories/json-mp-poll-cursors.repository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonMpPollCursorsRepository } from './json-mp-poll-cursors.repository';

describe('JsonMpPollCursorsRepository', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mp-poll-'));
    process.env.MP_POLL_CURSORS_FILE = join(tmp, 'mp-poll-cursors.json');
  });

  afterEach(() => {
    delete process.env.MP_POLL_CURSORS_FILE;
    rmSync(tmp, { recursive: true, force: true });
  });

  test('returns null for an unseen user', async () => {
    const repo = new JsonMpPollCursorsRepository();
    expect(await repo.getByUserId('alice')).toBeNull();
  });

  test('round-trips a cursor through upsert + getByUserId', async () => {
    const repo = new JsonMpPollCursorsRepository();
    const now = new Date('2026-05-22T18:30:00.000Z');
    await repo.upsert({ userId: 'alice', lastPolledAt: now });
    const got = await repo.getByUserId('alice');
    expect(got).not.toBeNull();
    expect(got!.userId).toBe('alice');
    expect(got!.lastPolledAt.toISOString()).toBe(now.toISOString());
  });

  test('upsert overwrites an existing cursor', async () => {
    const repo = new JsonMpPollCursorsRepository();
    await repo.upsert({ userId: 'alice', lastPolledAt: new Date('2026-05-22T18:00:00.000Z') });
    await repo.upsert({ userId: 'alice', lastPolledAt: new Date('2026-05-22T19:00:00.000Z') });
    const got = await repo.getByUserId('alice');
    expect(got!.lastPolledAt.toISOString()).toBe('2026-05-22T19:00:00.000Z');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/api && bun test src/mp/repositories/json-mp-poll-cursors.repository.test.ts
```

Expected: FAIL with `Cannot find module './json-mp-poll-cursors.repository'`.

- [ ] **Step 4: Write the implementation**

`apps/api/src/mp/repositories/json-mp-poll-cursors.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { mpPollCursorsFile } from '../../shared/providers/paths';
import type { MpPollCursor } from '../domain/mp-poll-cursor';
import type { MpPollCursorsRepository } from '../domain/mp-poll-cursors.repository';

interface CursorRow {
  userId: string;
  lastPolledAt: string;
}

@Injectable()
export class JsonMpPollCursorsRepository implements MpPollCursorsRepository {
  private readonly store: JsonStore<CursorRow[]> = createJsonStore<CursorRow[]>(
    mpPollCursorsFile(),
    [],
  );

  async getByUserId(userId: string): Promise<MpPollCursor | null> {
    const rows = await this.store.read();
    const row = rows.find((r) => r.userId === userId);
    return row ? { userId: row.userId, lastPolledAt: new Date(row.lastPolledAt) } : null;
  }

  async upsert(cursor: MpPollCursor): Promise<void> {
    const rows = await this.store.read();
    const i = rows.findIndex((r) => r.userId === cursor.userId);
    const next: CursorRow = {
      userId: cursor.userId,
      lastPolledAt: cursor.lastPolledAt.toISOString(),
    };
    if (i === -1) rows.push(next);
    else rows[i] = next;
    await this.store.write(rows);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/api && bun test src/mp/repositories/json-mp-poll-cursors.repository.test.ts
```

Expected: 3 pass / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/providers/paths.ts \
       apps/api/src/mp/repositories/json-mp-poll-cursors.repository.ts \
       apps/api/src/mp/repositories/json-mp-poll-cursors.repository.test.ts
git commit -m "feat(api): JsonMpPollCursorsRepository with tests"
```

---

## Task 4 — `operation_type` enum + filter

**Files:**
- Create: `apps/api/src/mp/domain/operation-type.ts`

- [ ] **Step 1: Write the enum + helper**

`apps/api/src/mp/domain/operation-type.ts`:

```ts
import { z } from 'zod';

export const operationTypeSchema = z.enum([
  'regular_payment',
  'money_transfer',
  'recurring_payment',
  'account_fund',
]);

export type OperationType = z.infer<typeof operationTypeSchema>;

/**
 * `account_fund` is "user funded their MP wallet from their bank" — not a real
 * expense nor income, just an internal transfer. We never surface these.
 *
 * Unknown / missing values are treated as `regular_payment` (the most common).
 */
export const ACCEPTED_OPERATION_TYPES: ReadonlySet<OperationType> = new Set([
  'regular_payment',
  'money_transfer',
  'recurring_payment',
]);

export function isAcceptedOperationType(value: string | null | undefined): value is OperationType {
  return value != null && ACCEPTED_OPERATION_TYPES.has(value as OperationType);
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd apps/api && bun run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mp/domain/operation-type.ts
git commit -m "feat(api): MP operation_type enum + acceptance helper"
```

---

## Task 5 — `MpPaymentsSearchGateway` interface + types

**Files:**
- Create: `apps/api/src/mp/domain/mp-payments-search.gateway.ts`

- [ ] **Step 1: Write the contract**

`apps/api/src/mp/domain/mp-payments-search.gateway.ts`:

```ts
import type { MpPayment } from './mp-payment';

export const MP_PAYMENTS_SEARCH_GATEWAY = 'MP_PAYMENTS_SEARCH_GATEWAY';

export interface MpPaymentsSearchInput {
  readonly accessToken: string;
  readonly beginDate: Date;
  readonly endDate: Date;
  /** Hard cap on total results across pagination. Default applied by impl. */
  readonly maxResults?: number;
}

export interface MpPaymentsSearchResult {
  readonly results: readonly MpPayment[];
  readonly truncated: boolean;
  readonly totalReported: number;
}

export interface MpPaymentsSearchGateway {
  search(input: MpPaymentsSearchInput): Promise<MpPaymentsSearchResult>;
}
```

- [ ] **Step 2: Build verify**

```bash
cd apps/api && bun run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mp/domain/mp-payments-search.gateway.ts
git commit -m "feat(api): MpPaymentsSearchGateway interface"
```

---

## Task 6 — `HttpMpPaymentsSearchGateway` + tests

**Files:**
- Create: `apps/api/src/mp/providers/http-mp-payments-search.gateway.ts`
- Test: `apps/api/src/mp/providers/http-mp-payments-search.gateway.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/mp/providers/http-mp-payments-search.gateway.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { HttpMpPaymentsSearchGateway } from './http-mp-payments-search.gateway';

type FetchArgs = { url: string; init: RequestInit | undefined };

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: FetchArgs[] = [];
  let i = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const r = responses[i++] ?? { status: 500, body: 'no more responses' };
    return new Response(
      typeof r.body === 'string' ? r.body : JSON.stringify(r.body),
      { status: r.status ?? 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return calls;
}

describe('HttpMpPaymentsSearchGateway', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('builds the search URL with begin/end/sort params + bearer header', async () => {
    const calls = mockFetch([{ body: { paging: { total: 0, limit: 30, offset: 0 }, results: [] } }]);
    const gw = new HttpMpPaymentsSearchGateway();
    await gw.search({
      accessToken: 'tok',
      beginDate: new Date('2026-05-22T18:00:00.000Z'),
      endDate: new Date('2026-05-22T18:30:00.000Z'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('https://api.mercadopago.com/v1/payments/search');
    expect(calls[0].url).toContain('begin_date=2026-05-22T18%3A00%3A00.000Z');
    expect(calls[0].url).toContain('end_date=2026-05-22T18%3A30%3A00.000Z');
    expect(calls[0].url).toContain('sort=date_created');
    expect(calls[0].url).toContain('criteria=desc');
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  test('loops pagination until results stop coming, with safety cap', async () => {
    const page = (offset: number, count: number) => ({
      paging: { total: 80, limit: 30, offset },
      results: Array.from({ length: count }, (_, i) => ({ id: offset + i })),
    });
    mockFetch([page(0, 30), page(30, 30), page(60, 20)]);
    const gw = new HttpMpPaymentsSearchGateway();
    const res = await gw.search({
      accessToken: 'tok',
      beginDate: new Date('2026-05-22T18:00:00.000Z'),
      endDate: new Date('2026-05-22T18:30:00.000Z'),
    });
    expect(res.results).toHaveLength(80);
    expect(res.truncated).toBe(false);
    expect(res.totalReported).toBe(80);
  });

  test('honors maxResults cap and marks truncated', async () => {
    const page = (offset: number, count: number) => ({
      paging: { total: 999, limit: 30, offset },
      results: Array.from({ length: count }, (_, i) => ({ id: offset + i })),
    });
    mockFetch([page(0, 30), page(30, 30), page(60, 30)]);
    const gw = new HttpMpPaymentsSearchGateway();
    const res = await gw.search({
      accessToken: 'tok',
      beginDate: new Date(),
      endDate: new Date(),
      maxResults: 60,
    });
    expect(res.results).toHaveLength(60);
    expect(res.truncated).toBe(true);
  });

  test('throws on non-2xx status with status code preserved', async () => {
    mockFetch([{ status: 502, body: 'gateway timeout' }]);
    const gw = new HttpMpPaymentsSearchGateway();
    await expect(
      gw.search({
        accessToken: 'tok',
        beginDate: new Date(),
        endDate: new Date(),
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/api && bun test src/mp/providers/http-mp-payments-search.gateway.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`apps/api/src/mp/providers/http-mp-payments-search.gateway.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type {
  MpPaymentsSearchGateway,
  MpPaymentsSearchInput,
  MpPaymentsSearchResult,
} from '../domain/mp-payments-search.gateway';
import type { MpPayment } from '../domain/mp-payment';

const DEFAULT_CAP = 500;
const PAGE_LIMIT = 30;
const SEARCH_URL = 'https://api.mercadopago.com/v1/payments/search';

@Injectable()
export class HttpMpPaymentsSearchGateway implements MpPaymentsSearchGateway {
  private readonly log = new Logger(HttpMpPaymentsSearchGateway.name);

  async search(input: MpPaymentsSearchInput): Promise<MpPaymentsSearchResult> {
    const cap = input.maxResults ?? DEFAULT_CAP;
    const results: MpPayment[] = [];
    let offset = 0;
    let totalReported = 0;

    while (results.length < cap) {
      const params = new URLSearchParams({
        begin_date: input.beginDate.toISOString(),
        end_date: input.endDate.toISOString(),
        sort: 'date_created',
        criteria: 'desc',
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      });
      const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
        headers: { authorization: `Bearer ${input.accessToken}` },
      });
      if (!res.ok) {
        const body = await res.text();
        this.log.warn(`MP search HTTP ${res.status}: ${body.slice(0, 300)}`);
        throw new Error(`MP /v1/payments/search HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        paging: { total: number; limit: number; offset: number };
        results: MpPayment[];
      };
      totalReported = json.paging.total;
      results.push(...json.results);
      if (json.results.length < PAGE_LIMIT) break; // no more pages
      offset += PAGE_LIMIT;
    }

    const truncated = results.length >= cap;
    return {
      results: truncated ? results.slice(0, cap) : results,
      truncated,
      totalReported,
    };
  }
}
```

- [ ] **Step 4: Verify pass**

```bash
cd apps/api && bun test src/mp/providers/http-mp-payments-search.gateway.test.ts
```

Expected: 4 pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/providers/http-mp-payments-search.gateway.ts \
       apps/api/src/mp/providers/http-mp-payments-search.gateway.test.ts
git commit -m "feat(api): HttpMpPaymentsSearchGateway with pagination + cap"
```

---

## Task 7 — Add `user` to `PaymentClassifier` contract (future-proofing for §10b of spec)

**Files:**
- Modify: `apps/api/src/mp/domain/payment-classifier.ts`
- Modify: `apps/api/src/mp/providers/http-payment-classifier.ts`
- Modify: `apps/api/src/mp/providers/http-payment-classifier.test.ts`

- [ ] **Step 1: Extend the interface**

Edit `apps/api/src/mp/domain/payment-classifier.ts`. Add `user` to `ClassifyArgs`:

```ts
import type { User } from '../../users/domain/user';
import type { Classification } from './classification';

export const PAYMENT_CLASSIFIER = 'PAYMENT_CLASSIFIER';

export interface ClassifyArgs {
  readonly user: User;
  readonly kind: 'income' | 'expense';
  readonly amount: number;
  readonly merchant: string | null;
  readonly description: string | null;
  readonly counterparty: string | null;
}

export interface PaymentClassifier {
  classify(args: ClassifyArgs): Promise<Classification>;
}

export const FALLBACK_CLASSIFICATION = (merchant: string | null): Classification => ({
  category: 'otros',
  suggestedDescription: merchant ?? 'Movimiento de Mercado Pago',
  confidence: 0,
});
```

- [ ] **Step 2: Update the HTTP implementation to accept (and ignore) the field**

Edit `apps/api/src/mp/providers/http-payment-classifier.ts`. The new `user` field exists on the input type — destructure it but do not send it over the wire yet (per spec §10b, the payload contract to `apps/ai` does not change in this pivot):

Locate the `classify({ kind, amount, merchant, description, counterparty }: ClassifyArgs)` destructure (or equivalent) and add `user`:

```ts
async classify(args: ClassifyArgs): Promise<Classification> {
  const { kind, amount, merchant, description, counterparty } = args;
  // args.user is reserved for the in-flight per-user categories feature;
  // intentionally not sent to apps/ai until that feature lands (spec §10b).
  // ... rest of existing body unchanged
}
```

- [ ] **Step 3: Update the classifier test for the new arg shape**

Edit `apps/api/src/mp/providers/http-payment-classifier.test.ts`. Every test that constructs a `ClassifyArgs` payload must pass a `user`. Use this fixture at the top of the file:

```ts
import type { User } from '../../users/domain/user';

const fakeUser: User = {
  id: 'default-user',
  displayName: null,
  languagePref: null,
  mpUserId: null,
  mpAccessToken: null,
  mpRefreshToken: null,
  mpTokenExpiresAt: null,
  mpScope: null,
  mpLiveMode: null,
  mpConnectedAt: null,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};
```

Then in every call site `gw.classify({ kind: 'expense', amount: 100, merchant: 'Uber', description: null, counterparty: null })`, prepend `user: fakeUser,`.

- [ ] **Step 4: Run impacted tests**

```bash
cd apps/api && bun test src/mp/providers/http-payment-classifier.test.ts
```

Expected: existing tests pass with the new arg shape.

- [ ] **Step 5: Type-check the rest of the codebase**

```bash
cd apps/api && bun run build
```

Expected: clean. If any other caller of `classifier.classify(...)` is uncovered, fix it in this same step (likely only the webhook controller path, which we delete in Task 8).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/mp/domain/payment-classifier.ts \
       apps/api/src/mp/providers/http-payment-classifier.ts \
       apps/api/src/mp/providers/http-payment-classifier.test.ts
git commit -m "refactor(api): thread user through PaymentClassifier contract"
```

---

## Task 8 — Delete webhook artifacts

**Files:**
- Delete: `apps/api/src/mp/interface/mp-webhook.controller.ts`
- Delete: `apps/api/src/mp/interface/mp-webhook.controller.test.ts`
- Delete: `apps/api/src/mp/providers/mp-signature-verifier.ts`
- Delete: `apps/api/src/mp/providers/mp-signature-verifier.test.ts`
- Delete: `apps/api/scripts/create-mp-preference.ts`
- Modify: `apps/api/src/mp/interface/mp.schemas.ts` — drop the webhook section only
- Modify: `apps/api/src/mp/mp.module.ts` — drop webhook providers/controllers from imports
- Modify: `apps/api/.env`, `apps/api/.env.example` — drop `MP_WEBHOOK_SECRET`

- [ ] **Step 1: Delete the files**

```bash
git rm apps/api/src/mp/interface/mp-webhook.controller.ts
git rm apps/api/src/mp/interface/mp-webhook.controller.test.ts
git rm apps/api/src/mp/providers/mp-signature-verifier.ts
git rm apps/api/src/mp/providers/mp-signature-verifier.test.ts
git rm apps/api/scripts/create-mp-preference.ts
```

- [ ] **Step 2: Clean up `mp.schemas.ts`**

Open `apps/api/src/mp/interface/mp.schemas.ts`. Remove the webhook-related schemas (any `MpWebhookBody*`, `MpWebhookHeaders*`, etc.). Keep schemas used by OAuth endpoints (`MpOAuthCallbackQuery*`). If unsure, run `grep -r "MpWebhookBody" apps/api/src` after editing — should return zero results.

- [ ] **Step 3: Clean up `mp.module.ts`**

Edit `apps/api/src/mp/mp.module.ts`. Remove these lines:

```ts
import { MpWebhookController } from './interface/mp-webhook.controller';
import {
  MP_SIGNATURE_VERIFIER,
  createMpSignatureVerifier,
} from './providers/mp-signature-verifier';
```

In the `@Module` decorator:
- Remove `MpWebhookController` from `controllers`.
- Remove the `MP_SIGNATURE_VERIFIER` entry from `providers`.

Final `controllers` line: `controllers: [MpOAuthController],`.

- [ ] **Step 4: Remove `MP_WEBHOOK_SECRET` from env files**

```bash
sed -i '/^MP_WEBHOOK_SECRET=/d' apps/api/.env apps/api/.env.example
```

(On Windows, edit by hand if `sed` is unavailable.)

- [ ] **Step 5: Type-check**

```bash
cd apps/api && bun run build
```

Expected: clean. ProcessMpEvent still compiles because its current signature `{ paymentId, mpUserId }` has no other callers besides the (now deleted) webhook controller — and ProcessMpEvent itself is not yet refactored. The unused dependency is fine for one commit.

- [ ] **Step 6: Run the full suite**

```bash
cd apps/api && bun test
```

Expected: pass count drops by the number of deleted webhook + signature verifier tests; remaining tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/mp/interface/mp.schemas.ts \
       apps/api/src/mp/mp.module.ts \
       apps/api/.env \
       apps/api/.env.example
git commit -m "chore(api): remove MP webhook receiver, signature verifier, and preference script"
```

---

## Task 9 — Refactor `ProcessMpEvent` to `{ payment, user }`

**Files:**
- Modify: `apps/api/src/mp/use-cases/process-mp-event.use-case.ts`
- Modify: `apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts`
- Modify: `apps/api/src/mp/mp.module.ts` — drop `MP_PAYMENT_SOURCE` provider (no longer used)

- [ ] **Step 1: Update the test fixture file first (RED)**

Open `apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts`. Change all `execute({ paymentId: '...', mpUserId: '...' })` calls to `execute({ payment, user })` where:
- `user` is the `User` fixture already in the test
- `payment` is the hydrated `MpPayment` the test previously expected the `MP_PAYMENT_SOURCE` mock to return

Where the test set up a mock `MP_PAYMENT_SOURCE.getById`, replace that setup by building the `MpPayment` object inline and passing it to `execute`. Delete the mock for `MP_PAYMENT_SOURCE` from the Nest testing module providers.

Also: every place the test passes `ClassifyArgs` through a classifier mock should now include `user` — already done by Task 7.

- [ ] **Step 2: Run the test — verify it fails as expected (signature mismatch)**

```bash
cd apps/api && bun test src/mp/use-cases/process-mp-event.use-case.test.ts
```

Expected: type errors / runtime failures referencing `payment`/`user` properties on the input.

- [ ] **Step 3: Refactor the use-case**

Edit `apps/api/src/mp/use-cases/process-mp-event.use-case.ts`:

1. Change the input interface:

```ts
import type { User } from '../../users/domain/user';
import type { MpPayment } from '../domain/mp-payment';

export interface ProcessMpEventInput {
  readonly payment: MpPayment;
  readonly user: User;
}
```

2. Remove the `MP_PAYMENT_SOURCE` import and the `@Inject(MP_PAYMENT_SOURCE)` constructor parameter.

3. Update `execute`:

```ts
async execute({ payment, user }: ProcessMpEventInput): Promise<void> {
  const paymentId = String(payment.id);
  const existingTx = await this.transactions.findByMpPaymentId(user.id, paymentId);
  const newStatus = mapMpStatusToTransactionStatus(payment.status);
  // ... rest of the branches stay identical, replacing `mpUserId` lookups
  //     with the already-resolved `user`.
}
```

4. In every call to `this.classifier.classify({...})`, prepend `user`:

```ts
const classification = await this.classifier.classify({
  user,
  kind,
  amount: payment.transaction_amount,
  merchant,
  description: payment.description ?? null,
  counterparty,
});
```

5. Delete the early `findByMpUserId` step — the caller (PollMpPayments, Task 11) already passes the resolved user.

- [ ] **Step 4: Drop `MP_PAYMENT_SOURCE` from `mp.module.ts`**

Edit `apps/api/src/mp/mp.module.ts`. Remove:
- `import { MP_PAYMENT_SOURCE } from './domain/mp-payment-source';`
- `import { MercadoPagoProvider } from './providers/mercado-pago.provider';`
- The `{ provide: MP_PAYMENT_SOURCE, useClass: MercadoPagoProvider }` entry from `providers`.
- `MP_PAYMENT_SOURCE` from the `exports` array.

Do NOT delete the files yet — `MercadoPagoProvider` may still be used by OAuth flows. Verify with `grep -r "MercadoPagoProvider" apps/api/src`. If only OAuth uses it, leave; if nothing uses it, delete in this same commit.

- [ ] **Step 5: Run the tests**

```bash
cd apps/api && bun test src/mp/use-cases/process-mp-event.use-case.test.ts
```

Expected: all branches pass.

- [ ] **Step 6: Run the full suite**

```bash
cd apps/api && bun test
```

Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/mp/use-cases/process-mp-event.use-case.ts \
       apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts \
       apps/api/src/mp/mp.module.ts
git commit -m "refactor(api): ProcessMpEvent takes hydrated { payment, user }"
```

---

## Task 10 — `PollMpPayments` use-case (skeleton + happy path)

**Files:**
- Create: `apps/api/src/mp/use-cases/poll-mp-payments.use-case.ts`
- Test: `apps/api/src/mp/use-cases/poll-mp-payments.use-case.test.ts`

- [ ] **Step 1: Write the failing happy-path test**

`apps/api/src/mp/use-cases/poll-mp-payments.use-case.test.ts`:

```ts
import { describe, expect, mock, test } from 'bun:test';
import { PollMpPayments } from './poll-mp-payments.use-case';
import type { MpPaymentsSearchGateway } from '../domain/mp-payments-search.gateway';
import type { MpPollCursorsRepository } from '../domain/mp-poll-cursors.repository';
import type { UsersRepository } from '../../users/domain/users.repository';
import type { User } from '../../users/domain/user';
import type { MpPayment } from '../domain/mp-payment';
import type { ProcessMpEvent } from './process-mp-event.use-case';
import type { RefreshMpToken } from './refresh-mp-token.use-case';

const baseUser: User = {
  id: 'u1',
  displayName: null,
  languagePref: null,
  mpUserId: '12345',
  mpAccessToken: 'tok',
  mpRefreshToken: 'rtok',
  mpTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  mpScope: 'payments read',
  mpLiveMode: true,
  mpConnectedAt: new Date('2026-05-22T18:00:00.000Z'),
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};

function payment(overrides: Partial<MpPayment>): MpPayment {
  return {
    id: 1,
    status: 'approved',
    operation_type: 'regular_payment',
    transaction_amount: 100,
    date_created: '2026-05-22T18:25:00.000Z',
    date_approved: '2026-05-22T18:25:00.000Z',
    description: 'Test',
    payment_method_id: 'visa',
    payment_type_id: 'credit_card',
    collector_id: 99,
    payer: { id: 12345, email: 'someone@example.com' },
    additional_info: { items: [{ title: 'Test' }] },
    ...overrides,
  } as MpPayment;
}

describe('PollMpPayments', () => {
  test('happy path: fetches window, filters account_fund, dispatches each remaining payment, advances cursor', async () => {
    const users: Pick<UsersRepository, 'getById'> = {
      getById: mock(async () => baseUser),
    } as unknown as UsersRepository;
    const cursors: MpPollCursorsRepository = {
      getByUserId: mock(async () => ({ userId: 'u1', lastPolledAt: new Date('2026-05-22T18:00:00.000Z') })),
      upsert: mock(async () => undefined),
    };
    const gateway: MpPaymentsSearchGateway = {
      search: mock(async () => ({
        results: [
          payment({ id: 1, operation_type: 'regular_payment' }),
          payment({ id: 2, operation_type: 'account_fund' }),
          payment({ id: 3, operation_type: 'money_transfer' }),
        ],
        truncated: false,
        totalReported: 3,
      })),
    };
    const process: Pick<ProcessMpEvent, 'execute'> = { execute: mock(async () => undefined) };
    const refresh: Pick<RefreshMpToken, 'execute'> = { execute: mock(async () => baseUser) };
    const clock = { now: () => new Date('2026-05-22T18:30:00.000Z') };

    const uc = new PollMpPayments(
      users as UsersRepository,
      cursors,
      gateway,
      process as ProcessMpEvent,
      refresh as RefreshMpToken,
      clock,
    );

    await uc.execute({ userId: 'u1' });

    expect((process.execute as ReturnType<typeof mock>).mock.calls).toHaveLength(2); // account_fund dropped
    expect((cursors.upsert as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect(
      ((cursors.upsert as ReturnType<typeof mock>).mock.calls[0][0] as { lastPolledAt: Date }).lastPolledAt.toISOString(),
    ).toBe('2026-05-22T18:30:00.000Z');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/api && bun test src/mp/use-cases/poll-mp-payments.use-case.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

`apps/api/src/mp/use-cases/poll-mp-payments.use-case.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/domain/users.repository';
import {
  MP_PAYMENTS_SEARCH_GATEWAY,
  type MpPaymentsSearchGateway,
} from '../domain/mp-payments-search.gateway';
import {
  MP_POLL_CURSORS_REPOSITORY,
  type MpPollCursorsRepository,
} from '../domain/mp-poll-cursors.repository';
import { isAcceptedOperationType } from '../domain/operation-type';
import { pollWindowBegin, type MpPollCursor } from '../domain/mp-poll-cursor';
import { ProcessMpEvent } from './process-mp-event.use-case';
import { RefreshMpToken } from './refresh-mp-token.use-case';
import { isMpTokenExpired, type User } from '../../users/domain/user';

export interface PollMpPaymentsInput {
  readonly userId: string;
}

@Injectable()
export class PollMpPayments {
  private readonly log = new Logger(PollMpPayments.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(MP_POLL_CURSORS_REPOSITORY) private readonly cursors: MpPollCursorsRepository,
    @Inject(MP_PAYMENTS_SEARCH_GATEWAY) private readonly gateway: MpPaymentsSearchGateway,
    private readonly processEvent: ProcessMpEvent,
    private readonly refreshToken: RefreshMpToken,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId }: PollMpPaymentsInput): Promise<void> {
    let user = await this.users.getById(userId);
    if (!user.mpUserId || !user.mpAccessToken) return; // not connected

    if (isMpTokenExpired(user, 2 * 60_000)) {
      user = await this.refreshToken.execute({ userId });
    }

    const end = this.clock.now();
    const cursor: MpPollCursor =
      (await this.cursors.getByUserId(userId)) ?? { userId, lastPolledAt: end };
    const begin = pollWindowBegin(cursor);

    const { results } = await this.gateway.search({
      accessToken: user.mpAccessToken!,
      beginDate: begin,
      endDate: end,
    });

    for (const payment of results) {
      if (!isAcceptedOperationType(payment.operation_type)) continue;
      await this.processEvent.execute({ payment, user });
    }

    await this.cursors.upsert({ userId, lastPolledAt: end });
  }
}
```

> Note: `UsersRepository` likely does not have `getById` today (it has `getCurrent`/`findByMpUserId`). Add `getById(userId: string): Promise<User>` to the contract (`apps/api/src/users/domain/users.repository.ts`) and implement it on `JsonUsersRepository` (look up by `id`, throw if missing). This is a tiny addition — do it as part of this step.

- [ ] **Step 4: Run the test**

```bash
cd apps/api && bun test src/mp/use-cases/poll-mp-payments.use-case.test.ts
```

Expected: 1 pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/use-cases/poll-mp-payments.use-case.ts \
       apps/api/src/mp/use-cases/poll-mp-payments.use-case.test.ts \
       apps/api/src/users/domain/users.repository.ts \
       apps/api/src/users/repositories/json-users.repository.ts
git commit -m "feat(api): PollMpPayments happy-path"
```

---

## Task 11 — `PollMpPayments` edge cases (cursor non-advance on failure, 401 retry, disconnected user)

**Files:**
- Modify: `apps/api/src/mp/use-cases/poll-mp-payments.use-case.ts`
- Modify: `apps/api/src/mp/use-cases/poll-mp-payments.use-case.test.ts`

- [ ] **Step 1: Add three failing tests**

Append to `poll-mp-payments.use-case.test.ts`:

```ts
describe('PollMpPayments edge cases', () => {
  test('does not advance cursor when ProcessMpEvent throws', async () => {
    const cursors: MpPollCursorsRepository = {
      getByUserId: mock(async () => ({ userId: 'u1', lastPolledAt: new Date('2026-05-22T18:00:00.000Z') })),
      upsert: mock(async () => undefined),
    };
    const process: Pick<ProcessMpEvent, 'execute'> = {
      execute: mock(async () => { throw new Error('classifier down'); }),
    };
    const users: Pick<UsersRepository, 'getById'> = { getById: mock(async () => baseUser) } as unknown as UsersRepository;
    const gateway: MpPaymentsSearchGateway = {
      search: mock(async () => ({ results: [payment({ id: 1 })], truncated: false, totalReported: 1 })),
    };
    const refresh: Pick<RefreshMpToken, 'execute'> = { execute: mock(async () => baseUser) };
    const clock = { now: () => new Date('2026-05-22T18:30:00.000Z') };

    const uc = new PollMpPayments(
      users as UsersRepository, cursors, gateway,
      process as ProcessMpEvent, refresh as RefreshMpToken, clock,
    );

    await expect(uc.execute({ userId: 'u1' })).rejects.toThrow('classifier down');
    expect((cursors.upsert as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });

  test('skips entirely if user is not MP-connected', async () => {
    const disconnected: User = { ...baseUser, mpUserId: null, mpAccessToken: null };
    const users: Pick<UsersRepository, 'getById'> = { getById: mock(async () => disconnected) } as unknown as UsersRepository;
    const gateway: MpPaymentsSearchGateway = { search: mock(async () => ({ results: [], truncated: false, totalReported: 0 })) };
    const cursors: MpPollCursorsRepository = { getByUserId: mock(async () => null), upsert: mock(async () => undefined) };
    const process: Pick<ProcessMpEvent, 'execute'> = { execute: mock(async () => undefined) };
    const refresh: Pick<RefreshMpToken, 'execute'> = { execute: mock(async () => disconnected) };
    const clock = { now: () => new Date('2026-05-22T18:30:00.000Z') };

    const uc = new PollMpPayments(
      users as UsersRepository, cursors, gateway,
      process as ProcessMpEvent, refresh as RefreshMpToken, clock,
    );

    await uc.execute({ userId: 'u1' });

    expect((gateway.search as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
    expect((cursors.upsert as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });

  test('refreshes token first when expiring within 2 minutes', async () => {
    const aboutToExpire: User = { ...baseUser, mpTokenExpiresAt: new Date(Date.now() + 60_000) };
    const refreshed: User = { ...baseUser, mpAccessToken: 'new-tok' };
    const users: Pick<UsersRepository, 'getById'> = { getById: mock(async () => aboutToExpire) } as unknown as UsersRepository;
    const refresh: Pick<RefreshMpToken, 'execute'> = { execute: mock(async () => refreshed) };
    const gateway: MpPaymentsSearchGateway = { search: mock(async () => ({ results: [], truncated: false, totalReported: 0 })) };
    const cursors: MpPollCursorsRepository = { getByUserId: mock(async () => null), upsert: mock(async () => undefined) };
    const process: Pick<ProcessMpEvent, 'execute'> = { execute: mock(async () => undefined) };
    const clock = { now: () => new Date() };

    const uc = new PollMpPayments(
      users as UsersRepository, cursors, gateway,
      process as ProcessMpEvent, refresh as RefreshMpToken, clock,
    );

    await uc.execute({ userId: 'u1' });

    expect((refresh.execute as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    const callArg = (gateway.search as ReturnType<typeof mock>).mock.calls[0][0] as { accessToken: string };
    expect(callArg.accessToken).toBe('new-tok');
  });
});
```

- [ ] **Step 2: Run — first two should pass already (the implementation matches), third already covered**

```bash
cd apps/api && bun test src/mp/use-cases/poll-mp-payments.use-case.test.ts
```

Expected: 4 pass / 0 fail. (Behavior was already correct in Task 10's implementation; this task documents it.)

- [ ] **Step 3: If any test fails, fix the implementation accordingly**

The most likely fix point is to ensure the cursor `upsert` only happens AFTER the for-loop completes without throwing. Verify the code structure matches that order.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mp/use-cases/poll-mp-payments.use-case.test.ts
git commit -m "test(api): PollMpPayments edge cases (cursor non-advance, disconnected, token refresh)"
```

---

## Task 12 — Wire poll-side providers + `MpPollScheduler`

**Files:**
- Modify: `apps/api/src/mp/mp.module.ts`
- Create: `apps/api/src/mp/infrastructure/mp-poll.scheduler.ts`

- [ ] **Step 1: Wire providers**

Edit `apps/api/src/mp/mp.module.ts`. Add imports and entries for the new things:

```ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ProactiveModule } from '../proactive/proactive.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { MpOAuthClient } from './providers/mp-oauth-client.provider';
import { StartMpConnect } from './use-cases/start-mp-connect.use-case';
import { CompleteMpConnect } from './use-cases/complete-mp-connect.use-case';
import { RefreshMpToken } from './use-cases/refresh-mp-token.use-case';
import { DisconnectMpAccount } from './use-cases/disconnect-mp-account.use-case';
import { ProcessMpEvent } from './use-cases/process-mp-event.use-case';
import { PollMpPayments } from './use-cases/poll-mp-payments.use-case';
import { MpOAuthController } from './interface/mp-oauth.controller';
import { PAYMENT_CLASSIFIER } from './domain/payment-classifier';
import { HttpPaymentClassifier } from './providers/http-payment-classifier';
import { MP_PAYMENTS_SEARCH_GATEWAY } from './domain/mp-payments-search.gateway';
import { HttpMpPaymentsSearchGateway } from './providers/http-mp-payments-search.gateway';
import { MP_POLL_CURSORS_REPOSITORY } from './domain/mp-poll-cursors.repository';
import { JsonMpPollCursorsRepository } from './repositories/json-mp-poll-cursors.repository';
import { MpPollScheduler } from './infrastructure/mp-poll.scheduler';

@Module({
  imports: [UsersModule, ProactiveModule, TransactionsModule],
  controllers: [MpOAuthController],
  providers: [
    MpOAuthClient,
    StartMpConnect,
    CompleteMpConnect,
    RefreshMpToken,
    DisconnectMpAccount,
    ProcessMpEvent,
    PollMpPayments,
    MpPollScheduler,
    { provide: PAYMENT_CLASSIFIER, useClass: HttpPaymentClassifier },
    { provide: MP_PAYMENTS_SEARCH_GATEWAY, useClass: HttpMpPaymentsSearchGateway },
    { provide: MP_POLL_CURSORS_REPOSITORY, useClass: JsonMpPollCursorsRepository },
  ],
  exports: [MpOAuthClient, RefreshMpToken, PAYMENT_CLASSIFIER],
})
export class MpModule {}
```

- [ ] **Step 2: Create the scheduler**

`apps/api/src/mp/infrastructure/mp-poll.scheduler.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/domain/users.repository';
import { PollMpPayments } from '../use-cases/poll-mp-payments.use-case';

@Injectable()
export class MpPollScheduler {
  private readonly log = new Logger(MpPollScheduler.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly poll: PollMpPayments,
  ) {}

  /** Every 2 minutes. Errors are caught per-user; one user does not block others. */
  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    const connected = await this.users.listMpConnected();
    for (const user of connected) {
      try {
        await this.poll.execute({ userId: user.id });
      } catch (err) {
        this.log.warn(`poll failed for user ${user.id}: ${(err as Error).message}`);
      }
    }
  }
}
```

> Note: `UsersRepository.listMpConnected()` does not exist yet. Add it to the contract and `JsonUsersRepository` (returns users with non-null `mpUserId`). Tiny method.

- [ ] **Step 3: Type-check**

```bash
cd apps/api && bun run build
```

Expected: clean.

- [ ] **Step 4: Run the full suite**

```bash
cd apps/api && bun test
```

Expected: no regressions. The scheduler does not fire in tests because Jest/Bun don't trigger cron.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/mp.module.ts \
       apps/api/src/mp/infrastructure/mp-poll.scheduler.ts \
       apps/api/src/users/domain/users.repository.ts \
       apps/api/src/users/repositories/json-users.repository.ts
git commit -m "feat(api): wire poll providers + MpPollScheduler @Cron */2 min"
```

---

## Task 13 — `classify-batch` Mastra workflow (`apps/ai`)

**Files:**
- Create: `apps/ai/src/mp-classification/domain/classify-batch.ts`
- Create: `apps/ai/src/mp-classification/workflows/classify-batch.workflow.ts`
- Modify: `apps/ai/src/mastra/index.ts` — register

- [ ] **Step 1: Define the Zod schemas**

`apps/ai/src/mp-classification/domain/classify-batch.ts`:

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { classifyMpEventInput } from './classification';

export const classifyBatchInput = z.object({
  payments: z.array(classifyMpEventInput).min(1),
  /**
   * Future-proofing hook for per-user categories (spec §10b). When omitted, the
   * agent uses its hardcoded category set.
   */
  categories: z
    .array(z.object({ name: categorySchema, description: z.string() }))
    .optional(),
});

export const classifyBatchOutput = z.object({
  classifications: z.array(
    z.object({
      category: categorySchema,
      suggestedDescription: z.string().min(1).max(80),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type ClassifyBatchInput = z.infer<typeof classifyBatchInput>;
export type ClassifyBatchOutput = z.infer<typeof classifyBatchOutput>;
```

- [ ] **Step 2: Write the workflow**

`apps/ai/src/mp-classification/workflows/classify-batch.workflow.ts`:

```ts
import { toStandardSchema } from '@mastra/core/schema';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { classifyBatchInput, classifyBatchOutput } from '../domain/classify-batch';
import { mpClassifierAgent } from '../agents/mp-classifier.agent';

const buildPrompt = createStep({
  id: 'build-batch-prompt',
  inputSchema: classifyBatchInput,
  outputSchema: z.object({ prompt: z.string() }),
  execute: async ({ inputData }) => {
    const items = inputData.payments
      .map((p, i) =>
        [
          `--- Pago #${i + 1} ---`,
          `Tipo: ${p.kind === 'income' ? 'cobro entrante' : 'pago saliente'}`,
          `Monto: ARS ${p.amount}`,
          `Comercio: ${p.merchant ?? 'desconocido'}`,
          `Descripción MP: ${p.description ?? 'ninguna'}`,
          `Contraparte: ${p.counterparty ?? 'desconocida'}`,
        ].join('\n'),
      )
      .join('\n\n');
    return {
      prompt: [
        'Te paso una lista de pagos para clasificar. Devolvé un array `classifications` con un objeto por pago, en el mismo orden.',
        items,
      ].join('\n\n'),
    };
  },
});

const classifyStep = createStep(mpClassifierAgent, {
  structuredOutput: { schema: toStandardSchema(classifyBatchOutput) },
});

export const classifyBatchWorkflow = createWorkflow({
  id: 'classify-batch',
  inputSchema: classifyBatchInput,
  outputSchema: classifyBatchOutput,
})
  .then(buildPrompt)
  .then(classifyStep)
  .commit();
```

- [ ] **Step 3: Register the workflow**

Edit `apps/ai/src/mastra/index.ts`. Add `classifyBatch: classifyBatchWorkflow` to the registry where `classifyMpEvent: classifyMpEventWorkflow` already lives.

- [ ] **Step 4: Smoke-build apps/ai**

```bash
cd apps/ai && bun run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/mp-classification/domain/classify-batch.ts \
       apps/ai/src/mp-classification/workflows/classify-batch.workflow.ts \
       apps/ai/src/mastra/index.ts
git commit -m "feat(ai): classify-batch workflow for backfill"
```

---

## Task 14 — `BackfillScope` value object

**Files:**
- Create: `apps/api/src/mp/domain/backfill-scope.ts`
- Test: `apps/api/src/mp/domain/backfill-scope.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/mp/domain/backfill-scope.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { backfillScopeDurationMs, BACKFILL_SCOPES, type BackfillScope } from './backfill-scope';

describe('backfillScopeDurationMs', () => {
  test('returns correct durations', () => {
    expect(backfillScopeDurationMs('24h')).toBe(24 * 60 * 60 * 1000);
    expect(backfillScopeDurationMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(backfillScopeDurationMs('15d')).toBe(15 * 24 * 60 * 60 * 1000);
    expect(backfillScopeDurationMs('30d')).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test('BACKFILL_SCOPES enumerates exactly the four supported scopes', () => {
    const scopes: BackfillScope[] = [...BACKFILL_SCOPES];
    expect(scopes).toEqual(['24h', '7d', '15d', '30d']);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/api && bun test src/mp/domain/backfill-scope.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the impl**

`apps/api/src/mp/domain/backfill-scope.ts`:

```ts
import { z } from 'zod';

export const backfillScopeSchema = z.enum(['24h', '7d', '15d', '30d']);
export type BackfillScope = z.infer<typeof backfillScopeSchema>;

export const BACKFILL_SCOPES: readonly BackfillScope[] = ['24h', '7d', '15d', '30d'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function backfillScopeDurationMs(scope: BackfillScope): number {
  switch (scope) {
    case '24h': return 24 * HOUR_MS;
    case '7d':  return 7  * DAY_MS;
    case '15d': return 15 * DAY_MS;
    case '30d': return 30 * DAY_MS;
  }
}
```

- [ ] **Step 4: Verify pass**

```bash
cd apps/api && bun test src/mp/domain/backfill-scope.test.ts
```

Expected: 2 pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/domain/backfill-scope.ts \
       apps/api/src/mp/domain/backfill-scope.test.ts
git commit -m "feat(api): BackfillScope value object + duration helper"
```

---

## Task 15 — `BackfillSummary` domain + JSON repository

**Files:**
- Create: `apps/api/src/proactive/domain/backfill-summary.ts`
- Create: `apps/api/src/proactive/domain/backfill-summaries.repository.ts`
- Modify: `apps/api/src/shared/providers/paths.ts` — add resolver
- Create: `apps/api/src/proactive/repositories/json-backfill-summaries.repository.ts`
- Test: `apps/api/src/proactive/repositories/json-backfill-summaries.repository.test.ts`

- [ ] **Step 1: Write the entity + repo contract**

`apps/api/src/proactive/domain/backfill-summary.ts`:

```ts
import type { BackfillScope } from '../../mp/domain/backfill-scope';
import type { OperationType } from '../../mp/domain/operation-type';

export interface BackfillSummary {
  readonly id: string;
  readonly userId: string;
  readonly scope: BackfillScope;
  readonly rangeBegin: Date;
  readonly rangeEnd: Date;
  readonly totalImported: number;
  readonly byOperationType: Record<OperationType, number>;
  readonly lowConfidenceCount: number;
  readonly truncated: boolean;
  readonly status: 'visible' | 'dismissed';
  readonly createdAt: Date;
}
```

`apps/api/src/proactive/domain/backfill-summaries.repository.ts`:

```ts
import type { BackfillSummary } from './backfill-summary';

export const BACKFILL_SUMMARIES_REPOSITORY = 'BACKFILL_SUMMARIES_REPOSITORY';

export interface BackfillSummariesRepository {
  create(summary: Omit<BackfillSummary, 'id' | 'createdAt'>): Promise<BackfillSummary>;
  getById(userId: string, id: string): Promise<BackfillSummary | null>;
  listForUser(userId: string): Promise<BackfillSummary[]>;
  markDismissed(id: string): Promise<void>;
}
```

- [ ] **Step 2: Add path resolver**

Append to `apps/api/src/shared/providers/paths.ts`:

```ts
export const backfillSummariesFile = (): string =>
  process.env.BACKFILL_SUMMARIES_FILE || path.join(DATA_DIR, 'backfill-summaries.json');
```

- [ ] **Step 3: Write the failing test**

`apps/api/src/proactive/repositories/json-backfill-summaries.repository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonBackfillSummariesRepository } from './json-backfill-summaries.repository';

describe('JsonBackfillSummariesRepository', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'bf-'));
    process.env.BACKFILL_SUMMARIES_FILE = join(tmp, 'backfill-summaries.json');
  });
  afterEach(() => {
    delete process.env.BACKFILL_SUMMARIES_FILE;
    rmSync(tmp, { recursive: true, force: true });
  });

  test('create assigns id + createdAt and round-trips', async () => {
    const repo = new JsonBackfillSummariesRepository();
    const created = await repo.create({
      userId: 'u1', scope: '7d',
      rangeBegin: new Date('2026-05-15T00:00:00.000Z'),
      rangeEnd: new Date('2026-05-22T00:00:00.000Z'),
      totalImported: 12,
      byOperationType: { regular_payment: 8, money_transfer: 3, recurring_payment: 1, account_fund: 0 },
      lowConfidenceCount: 2,
      truncated: false,
      status: 'visible',
    });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeInstanceOf(Date);
    const got = await repo.getById('u1', created.id);
    expect(got?.totalImported).toBe(12);
  });

  test('markDismissed flips status', async () => {
    const repo = new JsonBackfillSummariesRepository();
    const c = await repo.create({
      userId: 'u1', scope: '24h',
      rangeBegin: new Date(), rangeEnd: new Date(),
      totalImported: 0,
      byOperationType: { regular_payment: 0, money_transfer: 0, recurring_payment: 0, account_fund: 0 },
      lowConfidenceCount: 0, truncated: false, status: 'visible',
    });
    await repo.markDismissed(c.id);
    const got = await repo.getById('u1', c.id);
    expect(got?.status).toBe('dismissed');
  });
});
```

- [ ] **Step 4: Verify failure**

```bash
cd apps/api && bun test src/proactive/repositories/json-backfill-summaries.repository.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Write the impl**

`apps/api/src/proactive/repositories/json-backfill-summaries.repository.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { backfillSummariesFile } from '../../shared/providers/paths';
import type { BackfillSummary } from '../domain/backfill-summary';
import type { BackfillSummariesRepository } from '../domain/backfill-summaries.repository';
import type { OperationType } from '../../mp/domain/operation-type';
import type { BackfillScope } from '../../mp/domain/backfill-scope';

interface Row {
  id: string;
  userId: string;
  scope: BackfillScope;
  rangeBegin: string;
  rangeEnd: string;
  totalImported: number;
  byOperationType: Record<OperationType, number>;
  lowConfidenceCount: number;
  truncated: boolean;
  status: 'visible' | 'dismissed';
  createdAt: string;
}

@Injectable()
export class JsonBackfillSummariesRepository implements BackfillSummariesRepository {
  private readonly store: JsonStore<Row[]> = createJsonStore<Row[]>(backfillSummariesFile(), []);

  private toEntity(r: Row): BackfillSummary {
    return {
      id: r.id, userId: r.userId, scope: r.scope,
      rangeBegin: new Date(r.rangeBegin), rangeEnd: new Date(r.rangeEnd),
      totalImported: r.totalImported, byOperationType: r.byOperationType,
      lowConfidenceCount: r.lowConfidenceCount, truncated: r.truncated,
      status: r.status, createdAt: new Date(r.createdAt),
    };
  }

  async create(input: Omit<BackfillSummary, 'id' | 'createdAt'>): Promise<BackfillSummary> {
    const rows = await this.store.read();
    const row: Row = {
      ...input,
      id: randomUUID(),
      rangeBegin: input.rangeBegin.toISOString(),
      rangeEnd: input.rangeEnd.toISOString(),
      createdAt: new Date().toISOString(),
    };
    rows.push(row);
    await this.store.write(rows);
    return this.toEntity(row);
  }

  async getById(userId: string, id: string): Promise<BackfillSummary | null> {
    const rows = await this.store.read();
    const r = rows.find((x) => x.userId === userId && x.id === id);
    return r ? this.toEntity(r) : null;
  }

  async listForUser(userId: string): Promise<BackfillSummary[]> {
    const rows = await this.store.read();
    return rows.filter((r) => r.userId === userId).map((r) => this.toEntity(r));
  }

  async markDismissed(id: string): Promise<void> {
    const rows = await this.store.read();
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) return;
    rows[i] = { ...rows[i], status: 'dismissed' };
    await this.store.write(rows);
  }
}
```

- [ ] **Step 6: Verify pass**

```bash
cd apps/api && bun test src/proactive/repositories/json-backfill-summaries.repository.test.ts
```

Expected: 2 pass / 0 fail.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/proactive/domain/backfill-summary.ts \
       apps/api/src/proactive/domain/backfill-summaries.repository.ts \
       apps/api/src/proactive/repositories/json-backfill-summaries.repository.ts \
       apps/api/src/proactive/repositories/json-backfill-summaries.repository.test.ts \
       apps/api/src/shared/providers/paths.ts
git commit -m "feat(api): BackfillSummary domain + JSON repository"
```

---

## Task 16 — `BackfillMpPayments` use-case + tests

**Files:**
- Create: `apps/api/src/mp/use-cases/backfill-mp-payments.use-case.ts`
- Test: `apps/api/src/mp/use-cases/backfill-mp-payments.use-case.test.ts`

- [ ] **Step 1: Write the failing test (single end-to-end happy path)**

`apps/api/src/mp/use-cases/backfill-mp-payments.use-case.test.ts`:

```ts
import { describe, expect, mock, test } from 'bun:test';
import { BackfillMpPayments } from './backfill-mp-payments.use-case';
import type { MpPaymentsSearchGateway } from '../domain/mp-payments-search.gateway';
import type { MpPollCursorsRepository } from '../domain/mp-poll-cursors.repository';
import type { UsersRepository } from '../../users/domain/users.repository';
import type { TransactionsRepository } from '../../transactions/domain/transactions.repository';
import type { BackfillSummariesRepository } from '../../proactive/domain/backfill-summaries.repository';
import type { ProactiveEventBus } from '../../proactive/domain/proactive-event-bus';
import type { RefreshMpToken } from './refresh-mp-token.use-case';
import type { User } from '../../users/domain/user';
import type { MpPayment } from '../domain/mp-payment';

const user: User = {
  id: 'u1', displayName: null, languagePref: null,
  mpUserId: '12345', mpAccessToken: 'tok', mpRefreshToken: 'rtok',
  mpTokenExpiresAt: new Date('2030-01-01'), mpScope: 'payments read',
  mpLiveMode: true, mpConnectedAt: new Date('2026-05-22T18:00:00.000Z'),
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};

const p = (id: number, op: string, amount: number): MpPayment => ({
  id, status: 'approved', operation_type: op as MpPayment['operation_type'],
  transaction_amount: amount, date_created: '2026-05-21T00:00:00.000Z',
  date_approved: '2026-05-21T00:00:00.000Z', description: 'Test',
  payment_method_id: 'visa', payment_type_id: 'credit_card',
  collector_id: 99, payer: { id: 12345, email: 'p@example.com' },
  additional_info: { items: [{ title: 'Test' }] },
} as MpPayment);

describe('BackfillMpPayments', () => {
  test('imports filtered payments, builds summary, advances cursor, publishes SSE', async () => {
    const users: Pick<UsersRepository, 'getById'> = { getById: mock(async () => user) } as unknown as UsersRepository;
    const gateway: MpPaymentsSearchGateway = {
      search: mock(async () => ({
        results: [
          p(1, 'regular_payment', 100),
          p(2, 'account_fund', 5000),
          p(3, 'money_transfer', 200),
          p(4, 'recurring_payment', 300),
        ],
        truncated: false, totalReported: 4,
      })),
    };
    const transactions: Pick<TransactionsRepository, 'findByMpPaymentId' | 'create'> = {
      findByMpPaymentId: mock(async () => null),
      create: mock(async (input: { id?: string }) => ({ id: input.id ?? 'tx', ...input } as never)),
    } as unknown as TransactionsRepository;
    const summaries: BackfillSummariesRepository = {
      create: mock(async (i) => ({ ...i, id: 's1', createdAt: new Date() })),
      getById: mock(async () => null), listForUser: mock(async () => []), markDismissed: mock(async () => undefined),
    };
    const cursors: MpPollCursorsRepository = {
      getByUserId: mock(async () => null), upsert: mock(async () => undefined),
    };
    const refresh: Pick<RefreshMpToken, 'execute'> = { execute: mock(async () => user) };
    const bus: Pick<ProactiveEventBus, 'publishBackfillSummary'> = {
      publishBackfillSummary: mock(async () => undefined),
    } as unknown as ProactiveEventBus;
    const batchClassifier = {
      classifyBatch: mock(async (payments: MpPayment[]) =>
        payments.map((_, i) => ({
          category: 'otros' as const,
          suggestedDescription: 'Test',
          confidence: i === 0 ? 0.2 : 0.9, // first → low confidence
        }))),
    };
    const clock = { now: () => new Date('2026-05-22T18:30:00.000Z') };

    const uc = new BackfillMpPayments(
      users as UsersRepository, gateway, transactions as TransactionsRepository,
      summaries, cursors, refresh as RefreshMpToken,
      bus as ProactiveEventBus, batchClassifier, clock,
    );

    const result = await uc.execute({ userId: 'u1', scope: '7d' });

    expect(result.totalImported).toBe(3); // account_fund filtered
    expect(result.lowConfidenceCount).toBe(1);
    expect((transactions.create as ReturnType<typeof mock>).mock.calls).toHaveLength(3);
    expect((cursors.upsert as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect((bus.publishBackfillSummary as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/api && bun test src/mp/use-cases/backfill-mp-payments.use-case.test.ts
```

Expected: FAIL — module + `ProactiveEventBus.publishBackfillSummary` not found. Add the method to the event bus contract as part of this step (`apps/api/src/proactive/domain/proactive-event-bus.ts` — add `publishBackfillSummary(userId: string, summary: BackfillSummary): void`). Update the existing SSE bus implementation to forward it on the same SSE channel as a `kind: 'backfill_summary'` payload.

- [ ] **Step 3: Write the impl**

`apps/api/src/mp/use-cases/backfill-mp-payments.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from '../../transactions/domain/transactions.repository';
import { MP_PAYMENTS_SEARCH_GATEWAY, type MpPaymentsSearchGateway } from '../domain/mp-payments-search.gateway';
import { MP_POLL_CURSORS_REPOSITORY, type MpPollCursorsRepository } from '../domain/mp-poll-cursors.repository';
import { BACKFILL_SUMMARIES_REPOSITORY, type BackfillSummariesRepository } from '../../proactive/domain/backfill-summaries.repository';
import { PROACTIVE_EVENT_BUS, type ProactiveEventBus } from '../../proactive/domain/proactive-event-bus';
import { RefreshMpToken } from './refresh-mp-token.use-case';
import { isMpTokenExpired } from '../../users/domain/user';
import { backfillScopeDurationMs, type BackfillScope } from '../domain/backfill-scope';
import { isAcceptedOperationType, type OperationType } from '../domain/operation-type';
import { BATCH_CLASSIFIER, type BatchClassifier } from '../domain/batch-classifier';
import type { MpPayment } from '../domain/mp-payment';
import type { BackfillSummary } from '../../proactive/domain/backfill-summary';

const LOW_CONFIDENCE = 0.4;

export interface BackfillMpPaymentsInput {
  readonly userId: string;
  readonly scope: BackfillScope;
}

@Injectable()
export class BackfillMpPayments {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(MP_PAYMENTS_SEARCH_GATEWAY) private readonly gateway: MpPaymentsSearchGateway,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    @Inject(BACKFILL_SUMMARIES_REPOSITORY) private readonly summaries: BackfillSummariesRepository,
    @Inject(MP_POLL_CURSORS_REPOSITORY) private readonly cursors: MpPollCursorsRepository,
    private readonly refreshToken: RefreshMpToken,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
    @Inject(BATCH_CLASSIFIER) private readonly batch: BatchClassifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: BackfillMpPaymentsInput): Promise<BackfillSummary> {
    let user = await this.users.getById(input.userId);
    if (isMpTokenExpired(user, 2 * 60_000)) {
      user = await this.refreshToken.execute({ userId: input.userId });
    }

    const end = this.clock.now();
    const begin = new Date(end.getTime() - backfillScopeDurationMs(input.scope));

    const { results, truncated } = await this.gateway.search({
      accessToken: user.mpAccessToken!,
      beginDate: begin,
      endDate: end,
    });

    const accepted = results.filter((p) => isAcceptedOperationType(p.operation_type));

    // Dedupe against existing transactions
    const fresh: MpPayment[] = [];
    for (const p of accepted) {
      const found = await this.transactions.findByMpPaymentId(user.id, String(p.id));
      if (!found) fresh.push(p);
    }

    const classifications = fresh.length === 0
      ? []
      : await this.batch.classifyBatch({ user, payments: fresh });

    let lowConfidenceCount = 0;
    const byOperationType: Record<OperationType, number> = {
      regular_payment: 0, money_transfer: 0, recurring_payment: 0, account_fund: 0,
    };

    for (let i = 0; i < fresh.length; i++) {
      const p = fresh[i];
      const c = classifications[i];
      const low = c.confidence < LOW_CONFIDENCE;
      if (low) lowConfidenceCount += 1;
      byOperationType[p.operation_type as OperationType] =
        (byOperationType[p.operation_type as OperationType] ?? 0) + 1;

      const direction = p.collector_id === Number(user.mpUserId) ? 'income' : 'expense';
      await this.transactions.create({
        userId: user.id,
        amount: p.transaction_amount,
        category: low ? 'otros' : c.category,
        description: c.suggestedDescription,
        merchant: p.additional_info?.items?.[0]?.title ?? p.description ?? null,
        date: (p.date_approved ?? p.date_created ?? end.toISOString()).slice(0, 10),
        direction,
        source: 'mercadopago',
        status: 'active',
        mpPaymentId: String(p.id),
        needsReview: low,
        operationType: p.operation_type as OperationType,
      });
    }

    const summary = await this.summaries.create({
      userId: user.id, scope: input.scope,
      rangeBegin: begin, rangeEnd: end,
      totalImported: fresh.length,
      byOperationType, lowConfidenceCount, truncated,
      status: 'visible',
    });

    this.bus.publishBackfillSummary(user.id, summary);
    await this.cursors.upsert({ userId: user.id, lastPolledAt: end });
    return summary;
  }
}
```

> Notes during impl:
> - Define a `BatchClassifier` domain interface in `apps/api/src/mp/domain/batch-classifier.ts` (mirror of `PaymentClassifier`, but `classifyBatch({ user, payments }) → Promise<Classification[]>`), and an HTTP impl `HttpBatchClassifier` that POSTs to `apps/ai` workflow `classify-batch`. Add both files in this same task.
> - `TransactionsRepository.create` accepts new fields `needsReview: boolean` and `operationType: OperationType` — extend the input type and the JSON row shape. Migration of existing rows is handled by Task 23 (default both to safe values).

- [ ] **Step 4: Verify pass**

```bash
cd apps/api && bun test src/mp/use-cases/backfill-mp-payments.use-case.test.ts
```

Expected: 1 pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/use-cases/backfill-mp-payments.use-case.ts \
       apps/api/src/mp/use-cases/backfill-mp-payments.use-case.test.ts \
       apps/api/src/mp/domain/batch-classifier.ts \
       apps/api/src/mp/providers/http-batch-classifier.ts \
       apps/api/src/transactions/domain/transaction.ts \
       apps/api/src/transactions/domain/transactions.repository.ts \
       apps/api/src/transactions/repositories/*.ts \
       apps/api/src/proactive/domain/proactive-event-bus.ts \
       apps/api/src/proactive/providers/*event-bus*.ts
git commit -m "feat(api): BackfillMpPayments use-case end-to-end"
```

---

## Task 17 — `POST /mp/backfill` controller

**Files:**
- Create: `apps/api/src/mp/interface/mp-backfill.controller.ts`
- Modify: `apps/api/src/mp/mp.module.ts`

- [ ] **Step 1: Write the controller**

`apps/api/src/mp/interface/mp-backfill.controller.ts`:

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { backfillScopeSchema } from '../domain/backfill-scope';
import { BackfillMpPayments } from '../use-cases/backfill-mp-payments.use-case';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';

const body = z.object({ scope: backfillScopeSchema });

@Controller('mp/backfill')
export class MpBackfillController {
  constructor(
    private readonly backfill: BackfillMpPayments,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Post()
  async run(@Body() raw: unknown) {
    const { scope } = body.parse(raw);
    const user = await this.currentUser.resolve();
    const summary = await this.backfill.execute({ userId: user.id, scope });
    return {
      id: summary.id,
      totalImported: summary.totalImported,
      lowConfidenceCount: summary.lowConfidenceCount,
      byOperationType: summary.byOperationType,
      truncated: summary.truncated,
    };
  }
}
```

- [ ] **Step 2: Register the controller**

In `apps/api/src/mp/mp.module.ts`, add `MpBackfillController` to `controllers`, and `BackfillMpPayments` to `providers`. Also add `BACKFILL_SUMMARIES_REPOSITORY` provider (`{ provide: ..., useClass: JsonBackfillSummariesRepository }`).

- [ ] **Step 3: Type-check + run tests**

```bash
cd apps/api && bun run build && bun test
```

Expected: clean + green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mp/interface/mp-backfill.controller.ts \
       apps/api/src/mp/mp.module.ts
git commit -m "feat(api): POST /mp/backfill controller"
```

---

## Task 18 — `pickLeadCopy` pure function + tests

**Files:**
- Create: `apps/ui/src/proactive/providers/pick-lead-copy.ts`
- Test: `apps/ui/src/proactive/providers/pick-lead-copy.test.ts`

> Note: `apps/ui` does not run tests in CI by convention, but a co-located unit test for this pure function is valuable. Use `bun test` against this single file when verifying. If `bun:test` is not configured for apps/ui, lift the test to `apps/api/src/shared/providers/pick-lead-copy.test.ts` and re-export the function from apps/ui via path import. Default to keeping it in apps/ui; if `bun test` cannot pick it up, move it.

- [ ] **Step 1: Write the failing test**

`apps/ui/src/proactive/providers/pick-lead-copy.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { pickLeadCopy } from './pick-lead-copy';

describe('pickLeadCopy', () => {
  test('regular_payment + income', () => {
    expect(pickLeadCopy({ operationType: 'regular_payment', direction: 'income' })).toEqual({
      lead: 'Te llegaron', relator: 'de',
    });
  });
  test('regular_payment + expense', () => {
    expect(pickLeadCopy({ operationType: 'regular_payment', direction: 'expense' })).toEqual({
      lead: 'Pagaste', relator: 'a',
    });
  });
  test('money_transfer + income', () => {
    expect(pickLeadCopy({ operationType: 'money_transfer', direction: 'income' })).toEqual({
      lead: 'Te transfirieron', relator: 'de',
    });
  });
  test('money_transfer + expense', () => {
    expect(pickLeadCopy({ operationType: 'money_transfer', direction: 'expense' })).toEqual({
      lead: 'Transferiste', relator: 'a',
    });
  });
  test('recurring_payment + expense', () => {
    expect(pickLeadCopy({ operationType: 'recurring_payment', direction: 'expense' })).toEqual({
      lead: 'Pago recurrente', relator: 'de',
    });
  });
  test('recurring_payment + income falls back to regular income copy', () => {
    expect(pickLeadCopy({ operationType: 'recurring_payment', direction: 'income' })).toEqual({
      lead: 'Te llegaron', relator: 'de',
    });
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/ui && bun test src/proactive/providers/pick-lead-copy.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the impl**

`apps/ui/src/proactive/providers/pick-lead-copy.ts`:

```ts
export type OperationType = 'regular_payment' | 'money_transfer' | 'recurring_payment';
export type Direction = 'income' | 'expense';

export interface LeadCopy {
  readonly lead: string;
  readonly relator: 'a' | 'de';
}

export function pickLeadCopy(input: {
  operationType: OperationType;
  direction: Direction;
}): LeadCopy {
  const { operationType, direction } = input;
  if (operationType === 'money_transfer') {
    return direction === 'income'
      ? { lead: 'Te transfirieron', relator: 'de' }
      : { lead: 'Transferiste', relator: 'a' };
  }
  if (operationType === 'recurring_payment' && direction === 'expense') {
    return { lead: 'Pago recurrente', relator: 'de' };
  }
  // regular_payment (and recurring income fallback)
  return direction === 'income'
    ? { lead: 'Te llegaron', relator: 'de' }
    : { lead: 'Pagaste', relator: 'a' };
}
```

- [ ] **Step 4: Verify pass**

```bash
cd apps/ui && bun test src/proactive/providers/pick-lead-copy.test.ts
```

Expected: 6 pass / 0 fail. (If `bun test` is not picking up `apps/ui` files, see the note above and lift the test to `apps/api`.)

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/proactive/providers/pick-lead-copy.ts \
       apps/ui/src/proactive/providers/pick-lead-copy.test.ts
git commit -m "feat(ui): pickLeadCopy pure function"
```

---

## Task 19 — Thread `operationType` through PendingPrompt + UI consumption

**Files:**
- Modify: `apps/api/src/proactive/domain/pending-prompt.ts` — add `operationType`
- Modify: `apps/api/src/mp/use-cases/process-mp-event.use-case.ts` — set `operationType` when creating the prompt
- Modify: `apps/ui/src/proactive/domain/pending-prompt.ts` — mirror field
- Modify: `apps/ui/src/proactive/components/proactive-prompt-card.tsx` — use `pickLeadCopy`

- [ ] **Step 1: Add the field on the backend**

In `apps/api/src/proactive/domain/pending-prompt.ts`, add to `PendingPrompt`:

```ts
readonly operationType: 'regular_payment' | 'money_transfer' | 'recurring_payment';
```

Update `NewPendingPrompt` in the repository interface to include it.

- [ ] **Step 2: Set it in `ProcessMpEvent`**

In `apps/api/src/mp/use-cases/process-mp-event.use-case.ts`, in the `draftPrompt` helper (and wherever else prompts are constructed), pass `operationType: (payment.operation_type as 'regular_payment' | 'money_transfer' | 'recurring_payment')`. For the reversal-notice branch (BRANCH 1), default to `'regular_payment'` if unknown.

- [ ] **Step 3: Update the JSON repo**

In `apps/api/src/proactive/repositories/json-pending-prompts.repository.ts` (or whatever the implementation file is called), include `operationType` in the row shape and the entity mapper. For existing rows missing the field (loaded from disk), default to `'regular_payment'` in the mapper.

- [ ] **Step 4: Mirror on the UI domain**

Add the same field to `apps/ui/src/proactive/domain/pending-prompt.ts`.

- [ ] **Step 5: Refactor `proactive-prompt-card.tsx`**

Replace the inline `lead` / `direction` computation with `pickLeadCopy`:

```tsx
import { pickLeadCopy } from '@/proactive/providers/pick-lead-copy';

// inside the component, replace the lead/direction lines with:
const { lead, relator } = pickLeadCopy({
  operationType: prompt.operationType,
  direction: prompt.kind,
});

// and in the paragraph:
{lead} <Num value={prompt.amount} size="sm" /> {relator} {counterpart} del {date}.
```

- [ ] **Step 6: Build the API, build the UI**

```bash
cd apps/api && bun run build
cd ../ui && bun run build
```

Expected: clean. If UI build fails because of missing `operationType` in mock data, supply it.

- [ ] **Step 7: Run API tests**

```bash
cd apps/api && bun test
```

Expected: all green. Existing prompt-related tests may need `operationType: 'regular_payment'` added to fixtures.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/proactive/domain/pending-prompt.ts \
       apps/api/src/proactive/domain/pending-prompts.repository.ts \
       apps/api/src/proactive/repositories/*.ts \
       apps/api/src/mp/use-cases/process-mp-event.use-case.ts \
       apps/api/src/mp/use-cases/process-mp-event.use-case.test.ts \
       apps/ui/src/proactive/domain/pending-prompt.ts \
       apps/ui/src/proactive/components/proactive-prompt-card.tsx
git commit -m "feat: thread operationType end-to-end and adopt pickLeadCopy in UI"
```

---

## Task 20 — Collapse `source` enum + extend `Transaction` with `needsReview` + `operationType`

**Files:**
- Modify: `apps/api/src/transactions/domain/transaction.ts`
- Modify: `apps/api/src/transactions/domain/transactions.repository.ts`
- Modify: repo impls
- Modify: `apps/api/src/proactive/use-cases/resolve-proactive-prompt.use-case.ts` (source string)

- [ ] **Step 1: Edit the `Transaction` type**

`apps/api/src/transactions/domain/transaction.ts`:

```ts
export type TransactionSource = 'manual' | 'mercadopago';

export interface Transaction {
  // ... existing fields
  readonly source: TransactionSource;
  readonly needsReview: boolean;
  readonly operationType: 'regular_payment' | 'money_transfer' | 'recurring_payment' | null;
  // ...
}
```

> The exact union for `source` may have other current values (e.g. `'csv'`); preserve those. The key change is replacing `'mp_webhook'` with `'mercadopago'`.

- [ ] **Step 2: Update the repo `CreateInput` type and JSON row shape**

Add `needsReview: boolean` (default `false`) and `operationType: ... | null` (default `null`) to the row and entity mapper. Existing rows missing the fields default to `false` / `null`.

- [ ] **Step 3: Update `resolve-proactive-prompt.use-case.ts`**

Find `source: 'mp_webhook'` and change to `source: 'mercadopago'`. Pass through `operationType: prompt.operationType` and `needsReview: false`.

- [ ] **Step 4: Type-check + tests**

```bash
cd apps/api && bun run build && bun test
```

Expected: green. Any test inserting a Transaction with `source: 'mp_webhook'` needs to be updated.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions/domain/transaction.ts \
       apps/api/src/transactions/domain/transactions.repository.ts \
       apps/api/src/transactions/repositories/*.ts \
       apps/api/src/proactive/use-cases/resolve-proactive-prompt.use-case.ts \
       apps/api/src/proactive/use-cases/*.test.ts
git commit -m "refactor(api): source mp_webhook→mercadopago; add needsReview + operationType"
```

---

## Task 21 — `/mp/callback` route + `useMpConnection` state for backfill offer

**Files:**
- Create: `apps/ui/app/mp/callback/page.tsx`
- Modify: `apps/ui/src/mp/infrastructure/use-mp-connection.ts`
- Modify: `apps/ui/src/mp/infrastructure/http-mp-repository.ts`

- [ ] **Step 1: Extend the repository client**

In `apps/ui/src/mp/infrastructure/http-mp-repository.ts`, add:

```ts
async triggerBackfill(scope: '24h' | '7d' | '15d' | '30d'): Promise<{
  id: string;
  totalImported: number;
  lowConfidenceCount: number;
  truncated: boolean;
}> {
  const res = await fetch(`${this.baseUrl}/mp/backfill`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  if (!res.ok) throw new Error(`backfill failed: HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Add `pendingBackfillOffer` state to the hook**

In `apps/ui/src/mp/infrastructure/use-mp-connection.ts`, add a piece of state that defaults to `false` and is flipped to `true` by the callback route (via context or a router param). Expose `clearBackfillOffer()` to consumers.

- [ ] **Step 3: Create the callback page**

`apps/ui/app/mp/callback/page.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackfillModal } from '@/mp/components/backfill-modal';
import { useMpConnection } from '@/mp/infrastructure/use-mp-connection';

export default function MpCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useMpConnection();

  useEffect(() => {
    // The backend has already completed the token exchange; this page exists
    // purely to host the backfill modal before sending the user to the chat.
    refresh();
  }, [refresh]);

  const handleDone = () => router.replace('/');

  if (params.get('error')) {
    return <div className="p-6">Conexión cancelada. <a href="/">Volver</a></div>;
  }

  return <BackfillModal onDone={handleDone} />;
}
```

- [ ] **Step 4: Verify the page renders (manual)**

Run `bun dev --filter=ui` and open `/mp/callback` directly — it should render the modal.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/mp/callback/page.tsx \
       apps/ui/src/mp/infrastructure/http-mp-repository.ts \
       apps/ui/src/mp/infrastructure/use-mp-connection.ts
git commit -m "feat(ui): /mp/callback route hosts BackfillModal"
```

---

## Task 22 — `BackfillModal` component

**Files:**
- Create: `apps/ui/src/mp/components/backfill-modal.tsx`

- [ ] **Step 1: Build the component**

```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/shared/ui/card';
import { OptionPillStack } from '@/shared/ui/option-pill-stack';
import { useMpClient } from '@/mp/infrastructure/use-mp-client';

type Scope = '24h' | '7d' | '15d' | '30d';
type Choice = Scope | 'skip';

export function BackfillModal({ onDone }: { onDone: () => void }) {
  const [choice, setChoice] = useState<Choice>('skip');
  const [phase, setPhase] = useState<'choose' | 'running'>('choose');
  const [error, setError] = useState<string | null>(null);
  const mp = useMpClient();

  const submit = async () => {
    setError(null);
    if (choice === 'skip') { onDone(); return; }
    setPhase('running');
    try {
      await mp.triggerBackfill(choice);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setPhase('choose');
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg-overlay/40 backdrop-blur-sm">
      <Card variant="frosted" radius="lg" className="max-w-[460px] p-s5">
        <h2 className="font-display text-[18px] font-medium text-ink-1">¿Importamos tus pagos recientes?</h2>
        <p className="mt-s2 font-display text-[14px] text-ink-2">
          Podés traer un rango histórico o arrancar limpio. Después aparece todo en el chat.
        </p>

        <div className="mt-s4">
          <OptionPillStack
            label="Rango"
            options={[
              { id: 'skip', label: 'No, arrancamos limpio' },
              { id: '24h',  label: 'Últimas 24 horas' },
              { id: '7d',   label: 'Última semana' },
              { id: '15d',  label: 'Últimos 15 días' },
              { id: '30d',  label: 'Último mes' },
            ]}
            selectedId={choice}
            onPick={(id) => setChoice(id as Choice)}
          />
        </div>

        {error && <p className="mt-s2 font-display text-[12px] text-warn">{error}</p>}

        <div className="mt-s4 flex justify-end">
          <button
            type="button"
            disabled={phase === 'running'}
            onClick={submit}
            className="rounded-pill bg-ai px-s4 py-s2 font-display text-[14px] text-white disabled:opacity-50"
          >
            {phase === 'running' ? 'Trayendo…' : 'Continuar'}
          </button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test in browser**

Run `bun dev --filter=ui`, complete the OAuth flow, and confirm the modal renders with `skip` pre-selected. Try `7d` and observe the loading state.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/mp/components/backfill-modal.tsx
git commit -m "feat(ui): BackfillModal with scope chooser"
```

---

## Task 23 — `BackfillSummaryCard` + `BackfillDetailView`

**Files:**
- Create: `apps/ui/src/proactive/components/backfill-summary-card.tsx`
- Create: `apps/ui/src/proactive/components/backfill-detail-view.tsx`
- Modify: `apps/ui/src/proactive/components/thread.tsx` (or the equivalent that lists proactive cards) — render `BackfillSummaryCard` when `prompt.kind === 'backfill_summary'`

- [ ] **Step 1: Extend the UI domain**

In `apps/ui/src/proactive/domain/pending-prompt.ts`, add a discriminated union variant for backfill summaries (separate type with `kind: 'backfill_summary'` and the summary fields).

- [ ] **Step 2: Build the summary card**

`apps/ui/src/proactive/components/backfill-summary-card.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/shared/ui/card';
import { Eyebrow } from '@/shared/ui/eyebrow';
import { BackfillDetailView } from './backfill-detail-view';
import type { BackfillSummary } from '@/proactive/domain/pending-prompt';

export function BackfillSummaryCard({ summary }: { summary: BackfillSummary }) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <Card variant="frosted" radius="lg" className="max-w-[540px] p-s4 animate-message-enter">
      <Eyebrow tone="ai">Gasti</Eyebrow>
      <p className="mt-s2 font-display text-[17px] text-ink-1">
        Importé <strong>{summary.totalImported} movimientos</strong> de tu Mercado Pago.
      </p>
      <ul className="mt-s2 list-disc pl-s4 font-display text-[14px] text-ink-2">
        <li>{summary.byOperationType.regular_payment} pagos a comercios</li>
        <li>{summary.byOperationType.money_transfer} transferencias</li>
        <li>{summary.byOperationType.recurring_payment} pagos recurrentes</li>
        {summary.lowConfidenceCount > 0 && (
          <li className="text-warn">
            {summary.lowConfidenceCount} quedaron en &quot;otros&quot; para que los revises
          </li>
        )}
        {summary.truncated && (
          <li className="text-ink-3">Mostramos los más recientes; movimientos antiguos no se importaron</li>
        )}
      </ul>
      <div className="mt-s3 flex gap-s2">
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="rounded-pill bg-bg-2 px-s3 py-s1 font-display text-[12px]"
        >
          {showDetail ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </div>
      {showDetail && <BackfillDetailView summaryId={summary.id} />}
    </Card>
  );
}
```

- [ ] **Step 3: Build the detail view (initial — list-only)**

`apps/ui/src/proactive/components/backfill-detail-view.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTransactionsClient } from '@/transactions/infrastructure/use-transactions-client';

export function BackfillDetailView({ summaryId }: { summaryId: string }) {
  const client = useTransactionsClient();
  const [items, setItems] = useState<Array<{ id: string; amount: number; category: string; description: string; needsReview: boolean; date: string }> | null>(null);

  useEffect(() => {
    client.listByBackfill(summaryId).then(setItems);
  }, [client, summaryId]);

  if (!items) return <p className="mt-s3 text-ink-3">Cargando…</p>;
  const review = items.filter((i) => i.needsReview);
  const rest = items.filter((i) => !i.needsReview);
  return (
    <div className="mt-s3 space-y-s2">
      {review.length > 0 && (
        <section>
          <h4 className="font-display text-[12px] tracking-label text-warn">Revisalos</h4>
          {review.map((i) => <Row key={i.id} item={i} />)}
        </section>
      )}
      <section>
        <h4 className="font-display text-[12px] tracking-label text-ink-3">Importados</h4>
        {rest.map((i) => <Row key={i.id} item={i} />)}
      </section>
    </div>
  );
}

function Row({ item }: { item: { amount: number; category: string; description: string; date: string } }) {
  return (
    <div className="flex justify-between border-b border-divider py-s1 font-display text-[13px]">
      <span>{item.description}</span>
      <span className="text-ink-3">{item.category} · ${item.amount} · {item.date}</span>
    </div>
  );
}
```

> Note: `useTransactionsClient` and `listByBackfill` may need to be added — implement as a small wrapper over `GET /transactions?backfillId=...` (or filter client-side on the existing endpoint).

- [ ] **Step 4: Wire into the thread**

In the thread component that renders proactive cards, branch on the new union variant and render `BackfillSummaryCard` when `kind === 'backfill_summary'`.

- [ ] **Step 5: Smoke test**

Run `bun dev`, complete OAuth → choose `7d` in modal → return to chat → confirm summary card appears.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/proactive/components/backfill-summary-card.tsx \
       apps/ui/src/proactive/components/backfill-detail-view.tsx \
       apps/ui/src/proactive/domain/pending-prompt.ts \
       apps/ui/src/transactions/infrastructure/*.ts \
       apps/ui/src/proactive/components/thread.tsx
git commit -m "feat(ui): BackfillSummaryCard with editable detail view"
```

---

## Task 24 — `migrate-mp-source` script + tests

**Files:**
- Create: `apps/api/scripts/migrate-mp-source.ts`
- Test: `apps/api/scripts/migrate-mp-source.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/scripts/migrate-mp-source.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateMpSource } from './migrate-mp-source';

describe('migrate-mp-source', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mig-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('renames mp_webhook → mercadopago in transactions.json', async () => {
    const file = join(dir, 'transactions.json');
    writeFileSync(file, JSON.stringify([
      { id: '1', source: 'mp_webhook',  amount: 100 },
      { id: '2', source: 'manual',      amount: 200 },
      { id: '3', source: 'mercadopago', amount: 300 },
    ]));
    await migrateMpSource({ transactionsFile: file, promptsFile: null });
    const got = JSON.parse(readFileSync(file, 'utf8'));
    expect(got[0].source).toBe('mercadopago');
    expect(got[1].source).toBe('manual');
    expect(got[2].source).toBe('mercadopago');
  });

  test('defaults operationType on prompts missing the field', async () => {
    const file = join(dir, 'pending-prompts.json');
    writeFileSync(file, JSON.stringify([
      { id: 'a', mpPaymentId: '1' /* no operationType */ },
      { id: 'b', mpPaymentId: '2', operationType: 'money_transfer' },
    ]));
    await migrateMpSource({ transactionsFile: null, promptsFile: file });
    const got = JSON.parse(readFileSync(file, 'utf8'));
    expect(got[0].operationType).toBe('regular_payment');
    expect(got[1].operationType).toBe('money_transfer');
  });

  test('is idempotent — running twice yields the same result', async () => {
    const file = join(dir, 'transactions.json');
    writeFileSync(file, JSON.stringify([{ id: '1', source: 'mp_webhook' }]));
    await migrateMpSource({ transactionsFile: file, promptsFile: null });
    const after1 = readFileSync(file, 'utf8');
    await migrateMpSource({ transactionsFile: file, promptsFile: null });
    const after2 = readFileSync(file, 'utf8');
    expect(after2).toBe(after1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/api && bun test scripts/migrate-mp-source.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the script**

`apps/api/scripts/migrate-mp-source.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Args {
  transactionsFile: string | null;
  promptsFile: string | null;
}

export async function migrateMpSource({ transactionsFile, promptsFile }: Args): Promise<void> {
  if (transactionsFile) {
    const rows = JSON.parse(readFileSync(transactionsFile, 'utf8')) as Array<Record<string, unknown>>;
    let changed = false;
    for (const r of rows) {
      if (r.source === 'mp_webhook') { r.source = 'mercadopago'; changed = true; }
    }
    if (changed) writeFileSync(transactionsFile, JSON.stringify(rows, null, 2));
  }
  if (promptsFile) {
    const rows = JSON.parse(readFileSync(promptsFile, 'utf8')) as Array<Record<string, unknown>>;
    let changed = false;
    for (const r of rows) {
      if (!r.operationType) { r.operationType = 'regular_payment'; changed = true; }
    }
    if (changed) writeFileSync(promptsFile, JSON.stringify(rows, null, 2));
  }
}

// CLI entry — `bun run scripts/migrate-mp-source.ts`
if (import.meta.path === Bun.main) {
  const apiRoot = join(__dirname, '..');
  await migrateMpSource({
    transactionsFile: join(apiRoot, '..', '..', 'data', 'transactions.json'),
    promptsFile: join(apiRoot, 'data', 'pending-prompts.json'),
  });
  console.log('migrate-mp-source: done');
}
```

- [ ] **Step 4: Verify pass**

```bash
cd apps/api && bun test scripts/migrate-mp-source.test.ts
```

Expected: 3 pass / 0 fail.

- [ ] **Step 5: Run the script against real data**

```bash
cd apps/api && bun run scripts/migrate-mp-source.ts
```

Inspect the diff in `data/transactions.json` and `apps/api/data/pending-prompts.json` (if it exists).

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/migrate-mp-source.ts \
       apps/api/scripts/migrate-mp-source.test.ts \
       data/transactions.json \
       apps/api/data/pending-prompts.json
git commit -m "chore(api): migrate mp_webhook→mercadopago source + default operationType"
```

---

## Task 25 — End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start all three apps**

```bash
bun dev
```

Expected: `apps/api` on `3001`, `apps/ai` on `4111`, `apps/ui` on `3000`. All three boot without errors. Logs show `MpPollScheduler` registered.

- [ ] **Step 2: Verify the cron is wired**

Wait ~2 minutes after a fresh boot. In the api logs, expect a single `PollMpPayments` debug line per connected user. With no connected users, the scheduler should be silent.

- [ ] **Step 3: Backfill golden path**

1. From the UI, click the MP connection chip → complete OAuth in MP's site → land back at `/mp/callback`.
2. Modal renders with `Skip` selected.
3. Pick `7d`, click `Continuar`.
4. Modal shows `Trayendo…`, then closes.
5. UI redirects to `/`.
6. Chat thread renders the `BackfillSummaryCard` as the first message with N imported, op-type counts, low-confidence count, and a `Ver detalle` button.

- [ ] **Step 4: New payment golden path**

1. Make a real $1 ARS payment through MP (any flow that uses the connected account — Checkout Pro, P2P, etc.).
2. Wait up to 2 minutes.
3. A new `ProactivePromptCard` appears in the chat with the operation_type-aware lead copy.
4. Click `Agregar` and verify it appears in transactions list.

- [ ] **Step 5: Skip golden path**

1. Disconnect MP via the chip.
2. Reconnect.
3. At the callback, choose `Skip`.
4. No summary card appears.
5. Verify `mp-poll-cursors.json` shows `lastPolledAt ≈ now` for the user.

- [ ] **Step 6: Verify dedupe under restart**

1. Stop the API process while a payment is mid-classification.
2. Restart.
3. After the next cron tick, the payment is classified once (no duplicate row in `transactions.json`).

- [ ] **Step 7: If everything green, mark the worktree finished**

(Hand off to `superpowers:finishing-a-development-branch`.)

---

## Self-Review

**Spec coverage check:**
- §2 Scope: webhook deletion (T8), polling cron (T10–T12), backfill end-to-end (T14–T17, T21–T23), operation_type copy (T18–T19), source migration (T20, T24), out-of-scope items (manual refresh, multi-user) honored — no tasks create them.
- §4 Architecture: cron + per-user polling, batch classifier in apps/ai, SSE reuse, OAuth unchanged — all covered.
- §5 Deletions: webhook controller, signature verifier, schemas, dev scripts → T8.
- §6 Refactors: ProcessMpEvent signature → T9, PaymentClassifier contract → T7, source enum → T20, env → T8.
- §7 Creations: cursor (T2–T3), gateway (T5–T6), poll use-case (T10–T11), scheduler (T12), batch workflow (T13), backfill use-case (T16), backfill controller (T17), backfill summary (T15), publish summary use-case (folded into bus update in T16), UI components (T21–T23), `pickLeadCopy` (T18).
- §8 Polling rules: cursor advance only on success (T11), 5-min overlap (T2), 2-min token skew (T10–T11), per-user error boundary (T12), dedupe via `findByMpPaymentId` (T16, also enforced by `ProcessMpEvent` for the cron path).
- §9 Backfill flow: scope chooser modal (T22), auto-save + summary card (T16, T23), batch classify (T13, T16), pagination cap (T6, T16), low-confidence routing (T16).
- §10 Copy: pickLeadCopy with all 6 rows (T18), operationType field threading (T19).
- §10b Classifier evolution: PaymentClassifier `user` arg (T7), batch workflow `categories?` (T13), threading throughout (T9, T16) — covered.
- §11 Migration: T24.
- §12 Edge cases: cursor non-advance under failure (T11), 5xx handling (T6), MP unknown operation_type defaults (T4), pagination cap (T6, T16).
- §13 Tests: per-use-case bun:test covered.
- §15 Implementation phases: matches T1–T25.

**Placeholder scan:** No "TBD" / "TODO" left. All steps have concrete code or concrete commands. A few "Notes" in tasks describe small adjacent additions (e.g. `UsersRepository.getById`, `BatchClassifier` interface in Task 16) — these are explicit additions, not deferrals.

**Type consistency:** `MpPollCursor`, `BackfillSummary`, `BackfillScope`, `OperationType`, `PaymentClassifier.classify(args.user)` — same names used wherever referenced. `pickLeadCopy` returns `{ lead, relator }` consistently.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-mp-polling-pivot.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good fit because tasks have clear file boundaries and the spec is settled.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

**Which approach?**
