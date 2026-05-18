# Gasti `apps/api` Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `apps/api` NestJS domain — 24 `POST` endpoints, 1:1 with the Gasti agent's tools — delivering spending Q&A, insights, budget/goal coaching, income, categorization overrides, and transaction CRUD.

**Architecture:** Feature-first Clean Architecture. Seven NestJS feature modules (`transactions`, `spending`, `insights`, `budgets`, `income`, `categorization`, `goals`), each `domain/` → `use-cases/` → `providers/` → `repositories/` → thin `interface/` controller. A `shared/` kernel holds value types, a generic `JsonStore`, `PeriodResolver`, `CategoryResolver`, a Zod validation pipe, and a domain-error filter. JSON-file persistence; transactions rewrite `data/transactions.json` in place. All business logic lives in use-cases.

**Tech Stack:** NestJS 10, TypeScript (strict, CommonJS), Zod 3, Bun + `bun:test`.

**Reference spec:** `docs/superpowers/specs/2026-05-17-gasti-api-domain-design.md` — read it before starting. The exact wire shapes are also pinned in `docs/superpowers/specs/2026-05-15-gasti-agent-module-design.md` §5–6.

### Testing note

Per the user's instruction (recorded in the spec §1, §10), `apps/api` ships with tests. Each use-case and domain algorithm has `bun:test` coverage with in-memory fake repositories. Tasks follow RED → GREEN → REFACTOR. The per-task verification is **run the task's tests** plus `bun run build --filter=api` as the type-check gate.

### Conventions used throughout

- **DI tokens** are string constants (e.g. `TRANSACTIONS_REPOSITORY`), `@Inject('TOKEN')` on use-cases.
- **Repository interfaces** live in a `domain/` folder; JSON implementations in `repositories/`.
- **Use-cases** expose one `async execute(input)` method and return plain objects matching the contract.
- **Controllers** have one method per endpoint: validate the body with `ZodValidationPipe`, call `useCase.execute`, return the result.
- ISO dates are plain `yyyy-MM-dd` strings; date-range filtering is lexicographic (`tx.date >= from && tx.date <= to`).

---

## File Structure

```
apps/api/
├── package.json                MODIFY  +zod, +test script
├── tsconfig.json               MODIFY  exclude *.test.ts from build
├── .env.example                CREATE
└── src/
    ├── main.ts                 MODIFY  CORS + global pipe + filter
    ├── app.module.ts           MODIFY  import SharedModule + 7 feature modules
    ├── shared/
    │   ├── domain/             dates.ts category.ts period.ts transaction.ts goal.ts
    │   │                       category-overrides.ts domain-error.ts
    │   ├── providers/          paths.ts clock.ts json-store.ts period-resolver.ts
    │   │                       category-resolver.ts
    │   ├── interface/          zod-validation.pipe.ts domain-exception.filter.ts
    │   ├── testing/            fakes.ts
    │   └── shared.module.ts
    ├── transactions/  domain/ repositories/ use-cases/ interface/ transactions.module.ts
    ├── categorization/ repositories/ use-cases/ interface/ categorization.module.ts
    ├── spending/      use-cases/ interface/ spending.module.ts
    ├── insights/      use-cases/ interface/ insights.module.ts
    ├── budgets/       domain/ repositories/ use-cases/ interface/ budgets.module.ts
    ├── income/        domain/ repositories/ use-cases/ interface/ income.module.ts
    └── goals/         domain/ repositories/ use-cases/ interface/ goals.module.ts
turbo.json                      MODIFY  +test task
.gitignore                      MODIFY  +apps/api/data/
```

The `CategorizationRepository` interface and `CategoryOverrides` type live in `shared/domain/` (not `categorization/domain/`) because the shared `CategoryResolver` depends on them — this avoids a `shared → feature` import. The categorization *feature* owns only the JSON implementation, its two use-cases, and its controller.

---

## Task 1: Project setup

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/tsconfig.json`
- Modify: `turbo.json`
- Modify: `.gitignore`
- Create: `apps/api/.env.example`

- [ ] **Step 1: Add `zod` and a `test` script to `apps/api/package.json`**

Edit the `scripts` and `dependencies` blocks so the file reads:

```json
{
  "name": "api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "bun --watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "bun dist/main.js",
    "test": "bun test"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Exclude test files from the TypeScript build**

In `apps/api/tsconfig.json`, change the `exclude` array to:

```json
  "exclude": ["node_modules", "dist", "src/**/*.test.ts", "src/shared/testing"]
```

This keeps `bun:test` files and fakes out of the compiled `dist/`.

- [ ] **Step 3: Add a `test` task to `turbo.json`**

In the root `turbo.json`, add a `test` entry to `tasks`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "start": { "dependsOn": ["build"], "cache": false, "persistent": true },
    "test": { "cache": false }
  }
}
```

- [ ] **Step 4: Gitignore the runtime data directory**

Append to the root `.gitignore`:

```
# apps/api runtime state (JSON persistence)
apps/api/data/
```

- [ ] **Step 5: Create `apps/api/.env.example`**

```
# Port the NestJS API listens on
PORT=3001

# Seed transactions file (rewritten in place by transaction mutations).
# Default: <repo-root>/data/transactions.json
TRANSACTIONS_FILE=

# Directory for budgets/income/goals/overrides JSON files.
# Default: apps/api/data
API_DATA_DIR=
```

- [ ] **Step 6: Install**

Run: `bun install`
Expected: completes; `zod` resolved in `apps/api/node_modules`.

- [ ] **Step 7: Verify the build still works**

Run: `bun run build --filter=api`
Expected: exit 0, no output.

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/.env.example turbo.json .gitignore bun.lock
git commit -m "chore(api): add zod, test script, runtime data gitignore"
```

---

## Task 2: Shared domain types

**Files:**
- Create: `apps/api/src/shared/domain/dates.ts`
- Create: `apps/api/src/shared/domain/category.ts`
- Create: `apps/api/src/shared/domain/period.ts`
- Create: `apps/api/src/shared/domain/transaction.ts`
- Create: `apps/api/src/shared/domain/goal.ts`
- Create: `apps/api/src/shared/domain/domain-error.ts`

- [ ] **Step 1: Create `dates.ts`** — pure UTC date helpers, no framework imports.

```ts
export function formatIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function startOfMonth(d: Date): string {
  return formatIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatIso(d);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

export function monthKey(d: Date): string {
  return formatIso(d).slice(0, 7);
}

export function calendarMonthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return {
    from: formatIso(new Date(Date.UTC(y, m - 1, 1))),
    to: formatIso(new Date(Date.UTC(y, m, 0))),
  };
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86_400_000);
}

/** Fractional months between two ISO dates (~30-day month), never negative. */
export function monthsBetween(fromIso: string, toIso: string): number {
  return Math.max(daysBetween(fromIso, toIso) / 30, 0);
}
```

- [ ] **Step 2: Create `category.ts`** — the category union + the essential/discretionary domain rule.

```ts
import { z } from 'zod';

export const categorySchema = z.enum([
  'comida',
  'transporte',
  'entretenimiento',
  'salud',
  'servicios',
  'educacion',
  'otros',
]);

export type Category = z.infer<typeof categorySchema>;

export const DISCRETIONARY_CATEGORIES: readonly Category[] = ['entretenimiento', 'otros'];

export function isDiscretionary(category: Category): boolean {
  return DISCRETIONARY_CATEGORIES.includes(category);
}
```

- [ ] **Step 3: Create `period.ts`** — the `Period` discriminated union + a resolved range.

```ts
import { z } from 'zod';

export const periodSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('currentMonth') }),
  z.object({ kind: z.literal('lastNDays'), n: z.number().int().positive() }),
  z.object({ kind: z.literal('calendarMonth'), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({
    kind: z.literal('customRange'),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

export type Period = z.infer<typeof periodSchema>;

export interface DateRange {
  from: string;
  to: string;
}
```

- [ ] **Step 4: Create `transaction.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from './category';

export const transactionSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.literal('ARS'),
  category: categorySchema,
  description: z.string(),
  merchant: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;
```

- [ ] **Step 5: Create `goal.ts`**

```ts
import type { Category } from './category';

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  linkedCategory: Category | null;
  createdAt: string;
}
```

- [ ] **Step 6: Create `domain-error.ts`**

```ts
export type DomainErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
```

- [ ] **Step 7: Type-check**

Run: `bun run build --filter=api`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/shared/domain
git commit -m "feat(api): shared domain types"
```

---

## Task 3: JsonStore, Clock & paths providers

**Files:**
- Create: `apps/api/src/shared/providers/paths.ts`
- Create: `apps/api/src/shared/providers/clock.ts`
- Create: `apps/api/src/shared/providers/json-store.ts`
- Test: `apps/api/src/shared/providers/json-store.test.ts`

- [ ] **Step 1: Create `paths.ts`** — resolves data-file locations once.

```ts
import path from 'node:path';

// This file: apps/api/src/shared/providers/paths.ts
const API_ROOT = path.resolve(__dirname, '../../..'); // apps/api
const REPO_ROOT = path.resolve(API_ROOT, '../..'); // repo root

export const TRANSACTIONS_FILE =
  process.env.TRANSACTIONS_FILE || path.join(REPO_ROOT, 'data/transactions.json');

export const DATA_DIR = process.env.API_DATA_DIR || path.join(API_ROOT, 'data');
```

- [ ] **Step 2: Create `clock.ts`** — an injectable time source so date logic is testable.

```ts
export interface Clock {
  now(): Date;
}

export const CLOCK = 'CLOCK';

export const systemClock: Clock = {
  now: () => new Date(),
};
```

- [ ] **Step 3: Create `json-store.ts`** — the generic atomic file store.

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface JsonStore<T> {
  read(): Promise<T>;
  write(data: T): Promise<void>;
}

/**
 * File-backed JSON store. `read()` returns a deep clone of `fallback` when the
 * file is absent. `write()` is atomic: it writes a `.tmp` sibling then renames
 * over the target, so a crash never leaves a half-written file.
 */
export function createJsonStore<T>(filePath: string, fallback: T): JsonStore<T> {
  return {
    async read(): Promise<T> {
      try {
        return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return structuredClone(fallback);
        }
        throw err;
      }
    },
    async write(data: T): Promise<void> {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmp, filePath);
    },
  };
}
```

- [ ] **Step 4: Write the failing test** — `json-store.test.ts`

```ts
import { test, expect } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createJsonStore } from './json-store';

test('read returns the fallback when the file is absent', async () => {
  const file = path.join(os.tmpdir(), `gasti-jsonstore-${Date.now()}-a.json`);
  const store = createJsonStore<{ count: number }>(file, { count: 0 });
  expect(await store.read()).toEqual({ count: 0 });
});

test('write then read round-trips the data', async () => {
  const file = path.join(os.tmpdir(), `gasti-jsonstore-${Date.now()}-b.json`);
  const store = createJsonStore<{ count: number }>(file, { count: 0 });
  await store.write({ count: 7 });
  expect(await store.read()).toEqual({ count: 7 });
  await fs.rm(file, { force: true });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test apps/api/src/shared/providers/json-store.test.ts`
Expected: PASS, 2 tests. (The implementation from Step 3 already satisfies it — this confirms the store works.)

- [ ] **Step 6: Type-check**

Run: `bun run build --filter=api`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shared/providers/paths.ts apps/api/src/shared/providers/clock.ts apps/api/src/shared/providers/json-store.ts apps/api/src/shared/providers/json-store.test.ts
git commit -m "feat(api): json-store, clock and path providers"
```

---

## Task 4: PeriodResolver

**Files:**
- Create: `apps/api/src/shared/providers/period-resolver.ts`
- Test: `apps/api/src/shared/providers/period-resolver.test.ts`

- [ ] **Step 1: Write the failing test** — `period-resolver.test.ts`

```ts
import { test, expect } from 'bun:test';
import { PeriodResolver } from './period-resolver';
import type { Clock } from './clock';

const clock: Clock = { now: () => new Date('2026-05-17T12:00:00.000Z') };
const resolver = new PeriodResolver(clock);

test('currentMonth resolves from the 1st to today', () => {
  expect(resolver.resolve({ kind: 'currentMonth' })).toEqual({ from: '2026-05-01', to: '2026-05-17' });
});

test('lastNDays resolves an inclusive N-day window ending today', () => {
  expect(resolver.resolve({ kind: 'lastNDays', n: 7 })).toEqual({ from: '2026-05-11', to: '2026-05-17' });
});

test('calendarMonth resolves the full month', () => {
  expect(resolver.resolve({ kind: 'calendarMonth', month: '2026-04' })).toEqual({
    from: '2026-04-01',
    to: '2026-04-30',
  });
});

test('customRange passes the bounds through', () => {
  expect(resolver.resolve({ kind: 'customRange', from: '2026-04-15', to: '2026-05-05' })).toEqual({
    from: '2026-04-15',
    to: '2026-05-05',
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/api/src/shared/providers/period-resolver.test.ts`
Expected: FAIL — `Cannot find module './period-resolver'`.

- [ ] **Step 3: Create `period-resolver.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { DateRange, Period } from '../domain/period';
import { addDays, calendarMonthRange, formatIso, startOfMonth } from '../domain/dates';
import { CLOCK, type Clock } from './clock';

@Injectable()
export class PeriodResolver {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  resolve(period: Period): DateRange {
    const now = this.clock.now();
    switch (period.kind) {
      case 'currentMonth':
        return { from: startOfMonth(now), to: formatIso(now) };
      case 'lastNDays':
        return { from: addDays(formatIso(now), -(period.n - 1)), to: formatIso(now) };
      case 'calendarMonth':
        return calendarMonthRange(period.month);
      case 'customRange':
        return { from: period.from, to: period.to };
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/api/src/shared/providers/period-resolver.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/providers/period-resolver.ts apps/api/src/shared/providers/period-resolver.test.ts
git commit -m "feat(api): period resolver"
```

---

## Task 5: ZodValidationPipe & DomainExceptionFilter

**Files:**
- Create: `apps/api/src/shared/interface/zod-validation.pipe.ts`
- Create: `apps/api/src/shared/interface/domain-exception.filter.ts`

- [ ] **Step 1: Create `zod-validation.pipe.ts`**

```ts
import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { DomainError } from '../domain/domain-error';

/** Validates a request body against a Zod schema; rejects with a DomainError. */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join('.') || 'body';
      throw new DomainError('VALIDATION_ERROR', `${path}: ${issue?.message ?? 'invalid input'}`);
    }
    return result.data;
  }
}
```

- [ ] **Step 2: Create `domain-exception.filter.ts`**

```ts
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../domain/domain-error';

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
};

/** Renders every error as the `{ error: { code, message } }` envelope. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      res.status(STATUS_BY_CODE[exception.code] ?? 400).json({
        error: { code: exception.code, message: exception.message },
      });
      return;
    }

    const message = exception instanceof Error ? exception.message : 'Unexpected error';
    res.status(500).json({ error: { code: 'INTERNAL', message } });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `bun run build --filter=api`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/shared/interface
git commit -m "feat(api): zod validation pipe and domain exception filter"
```

---

## Task 6: Transactions repository

**Files:**
- Create: `apps/api/src/transactions/domain/transactions.repository.ts`
- Create: `apps/api/src/transactions/repositories/json-transactions.repository.ts`
- Create: `apps/api/src/transactions/transactions.module.ts`

- [ ] **Step 1: Create `transactions.repository.ts`** — the contract.

```ts
import type { Transaction } from '../../shared/domain/transaction';

export const TRANSACTIONS_REPOSITORY = 'TRANSACTIONS_REPOSITORY';

export type TransactionFields = Partial<Omit<Transaction, 'id' | 'currency'>>;

export interface TransactionsRepository {
  all(): Promise<Transaction[]>;
  add(tx: Transaction): Promise<void>;
  update(id: string, fields: TransactionFields): Promise<Transaction | null>;
  delete(id: string): Promise<boolean>;
  nextId(): Promise<string>;
}
```

- [ ] **Step 2: Create `json-transactions.repository.ts`** — rewrites `data/transactions.json` in place.

```ts
import { Injectable } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { TRANSACTIONS_FILE } from '../../shared/providers/paths';
import type { Transaction } from '../../shared/domain/transaction';
import type { TransactionFields, TransactionsRepository } from '../domain/transactions.repository';

@Injectable()
export class JsonTransactionsRepository implements TransactionsRepository {
  private readonly store: JsonStore<Transaction[]> = createJsonStore<Transaction[]>(
    TRANSACTIONS_FILE,
    [],
  );

  all(): Promise<Transaction[]> {
    return this.store.read();
  }

  async add(tx: Transaction): Promise<void> {
    const txs = await this.store.read();
    txs.push(tx);
    await this.store.write(txs);
  }

  async update(id: string, fields: TransactionFields): Promise<Transaction | null> {
    const txs = await this.store.read();
    const index = txs.findIndex((t) => t.id === id);
    if (index === -1) return null;
    txs[index] = { ...txs[index], ...fields };
    await this.store.write(txs);
    return txs[index];
  }

  async delete(id: string): Promise<boolean> {
    const txs = await this.store.read();
    const next = txs.filter((t) => t.id !== id);
    if (next.length === txs.length) return false;
    await this.store.write(next);
    return true;
  }

  async nextId(): Promise<string> {
    const txs = await this.store.read();
    const max = txs.reduce((m, t) => {
      const n = Number(t.id.replace(/\D/g, ''));
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `txn_${String(max + 1).padStart(3, '0')}`;
  }
}
```

- [ ] **Step 3: Create `transactions.module.ts`** — provides and exports the repository so other features can read transactions. Use-cases and the controller are added in Task 8.

```ts
import { Module } from '@nestjs/common';
import { TRANSACTIONS_REPOSITORY } from './domain/transactions.repository';
import { JsonTransactionsRepository } from './repositories/json-transactions.repository';

@Module({
  providers: [{ provide: TRANSACTIONS_REPOSITORY, useClass: JsonTransactionsRepository }],
  exports: [TRANSACTIONS_REPOSITORY],
})
export class TransactionsModule {}
```

- [ ] **Step 4: Type-check**

Run: `bun run build --filter=api`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions
git commit -m "feat(api): transactions repository"
```

---

## Task 7: Categorization repository, CategoryResolver, SharedModule & test fakes

**Files:**
- Create: `apps/api/src/shared/domain/category-overrides.ts`
- Create: `apps/api/src/categorization/repositories/json-categorization.repository.ts`
- Create: `apps/api/src/shared/providers/category-resolver.ts`
- Create: `apps/api/src/shared/testing/fakes.ts`
- Create: `apps/api/src/shared/shared.module.ts`
- Test: `apps/api/src/shared/providers/category-resolver.test.ts`

- [ ] **Step 1: Create `category-overrides.ts`** — the override type + repository contract (lives in `shared/domain` because `CategoryResolver` consumes it).

```ts
import type { Category } from './category';

export const CATEGORIZATION_REPOSITORY = 'CATEGORIZATION_REPOSITORY';

export interface CategoryOverrides {
  merchants: Record<string, Category>;
  transactions: Record<string, Category>;
}

export interface CategorizationRepository {
  overrides(): Promise<CategoryOverrides>;
  setMerchant(merchant: string, category: Category): Promise<void>;
  setTransaction(transactionId: string, category: Category): Promise<void>;
}

export const EMPTY_OVERRIDES: CategoryOverrides = { merchants: {}, transactions: {} };
```

- [ ] **Step 2: Create `json-categorization.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { Category } from '../../shared/domain/category';
import {
  EMPTY_OVERRIDES,
  type CategorizationRepository,
  type CategoryOverrides,
} from '../../shared/domain/category-overrides';

@Injectable()
export class JsonCategorizationRepository implements CategorizationRepository {
  private readonly store: JsonStore<CategoryOverrides> = createJsonStore<CategoryOverrides>(
    path.join(DATA_DIR, 'category-overrides.json'),
    EMPTY_OVERRIDES,
  );

  overrides(): Promise<CategoryOverrides> {
    return this.store.read();
  }

  async setMerchant(merchant: string, category: Category): Promise<void> {
    const data = await this.store.read();
    data.merchants[merchant] = category;
    await this.store.write(data);
  }

  async setTransaction(transactionId: string, category: Category): Promise<void> {
    const data = await this.store.read();
    data.transactions[transactionId] = category;
    await this.store.write(data);
  }
}
```

- [ ] **Step 3: Create `category-resolver.ts`** — applies the tx → merchant → seed precedence.

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../domain/category';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../domain/category-overrides';
import type { Transaction } from '../domain/transaction';

@Injectable()
export class CategoryResolver {
  constructor(
    @Inject(CATEGORIZATION_REPOSITORY) private readonly repo: CategorizationRepository,
  ) {}

  /** Effective category for every transaction, keyed by id. Reads overrides once. */
  async resolveAll(txs: Transaction[]): Promise<Map<string, Category>> {
    const o = await this.repo.overrides();
    const map = new Map<string, Category>();
    for (const tx of txs) {
      map.set(tx.id, o.transactions[tx.id] ?? o.merchants[tx.merchant] ?? tx.category);
    }
    return map;
  }

  /** The merchant-level rule for a merchant, or null if none. */
  async categoryForMerchant(merchant: string): Promise<Category | null> {
    const o = await this.repo.overrides();
    return o.merchants[merchant] ?? null;
  }
}
```

- [ ] **Step 4: Create `shared/testing/fakes.ts`** — in-memory fakes used by every use-case test.

```ts
import type { Clock } from '../providers/clock';
import type { Transaction } from '../domain/transaction';
import type { Category } from '../domain/category';
import type {
  TransactionFields,
  TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import type {
  CategorizationRepository,
  CategoryOverrides,
} from '../domain/category-overrides';

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(`${iso}T12:00:00.000Z`) };
}

export function fakeTransactionsRepo(seed: Transaction[] = []): TransactionsRepository {
  let txs = seed.map((t) => ({ ...t }));
  return {
    async all() {
      return txs.map((t) => ({ ...t }));
    },
    async add(tx) {
      txs.push({ ...tx });
    },
    async update(id, fields: TransactionFields) {
      const i = txs.findIndex((t) => t.id === id);
      if (i === -1) return null;
      txs[i] = { ...txs[i], ...fields };
      return { ...txs[i] };
    },
    async delete(id) {
      const before = txs.length;
      txs = txs.filter((t) => t.id !== id);
      return txs.length < before;
    },
    async nextId() {
      return `txn_${String(txs.length + 1).padStart(3, '0')}`;
    },
  };
}

export function fakeCategorizationRepo(
  seed: Partial<CategoryOverrides> = {},
): CategorizationRepository {
  const data: CategoryOverrides = {
    merchants: { ...seed.merchants },
    transactions: { ...seed.transactions },
  };
  return {
    async overrides() {
      return { merchants: { ...data.merchants }, transactions: { ...data.transactions } };
    },
    async setMerchant(merchant, category: Category) {
      data.merchants[merchant] = category;
    },
    async setTransaction(transactionId, category: Category) {
      data.transactions[transactionId] = category;
    },
  };
}
```

- [ ] **Step 5: Create `shared.module.ts`** — provides the kernel, including the JSON `CategorizationRepository` so `CategoryResolver` has no module cycle.

```ts
import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './providers/clock';
import { PeriodResolver } from './providers/period-resolver';
import { CategoryResolver } from './providers/category-resolver';
import { CATEGORIZATION_REPOSITORY } from './domain/category-overrides';
import { JsonCategorizationRepository } from '../categorization/repositories/json-categorization.repository';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    PeriodResolver,
    CategoryResolver,
    { provide: CATEGORIZATION_REPOSITORY, useClass: JsonCategorizationRepository },
  ],
  exports: [CLOCK, PeriodResolver, CategoryResolver, CATEGORIZATION_REPOSITORY],
})
export class SharedModule {}
```

- [ ] **Step 6: Write the failing test** — `category-resolver.test.ts`

```ts
import { test, expect } from 'bun:test';
import { CategoryResolver } from './category-resolver';
import { fakeCategorizationRepo } from '../testing/fakes';
import type { Transaction } from '../domain/transaction';

const tx = (id: string, merchant: string, category: Transaction['category']): Transaction => ({
  id,
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category,
  description: '',
  merchant,
});

test('seed category is used when there is no override', async () => {
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const map = await resolver.resolveAll([tx('txn_001', 'Rappi', 'comida')]);
  expect(map.get('txn_001')).toBe('comida');
});

test('merchant rule overrides the seed category', async () => {
  const resolver = new CategoryResolver(
    fakeCategorizationRepo({ merchants: { Coderhouse: 'educacion' } }),
  );
  const map = await resolver.resolveAll([tx('txn_002', 'Coderhouse', 'otros')]);
  expect(map.get('txn_002')).toBe('educacion');
});

test('transaction override beats the merchant rule', async () => {
  const resolver = new CategoryResolver(
    fakeCategorizationRepo({
      merchants: { Coderhouse: 'educacion' },
      transactions: { txn_003: 'salud' },
    }),
  );
  const map = await resolver.resolveAll([tx('txn_003', 'Coderhouse', 'otros')]);
  expect(map.get('txn_003')).toBe('salud');
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `bun test apps/api/src/shared/providers/category-resolver.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/shared apps/api/src/categorization/repositories
git commit -m "feat(api): categorization repository, category resolver and shared module"
```

---

## Task 8: Transactions use-cases & controller

**Files:**
- Create: `apps/api/src/transactions/use-cases/add.use-case.ts`
- Create: `apps/api/src/transactions/use-cases/update.use-case.ts`
- Create: `apps/api/src/transactions/use-cases/delete.use-case.ts`
- Create: `apps/api/src/transactions/use-cases/propose-mutation.use-case.ts`
- Create: `apps/api/src/transactions/interface/transactions.schemas.ts`
- Create: `apps/api/src/transactions/interface/transactions.controller.ts`
- Modify: `apps/api/src/transactions/transactions.module.ts`
- Test: `apps/api/src/transactions/use-cases/add.use-case.test.ts`
- Test: `apps/api/src/transactions/use-cases/update.use-case.test.ts`
- Test: `apps/api/src/transactions/use-cases/delete.use-case.test.ts`
- Test: `apps/api/src/transactions/use-cases/propose-mutation.use-case.test.ts`

- [ ] **Step 1: Create `add.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { formatIso } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type { Transaction } from '../../shared/domain/transaction';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from '../domain/transactions.repository';

export interface AddTransactionInput {
  date?: string;
  amount: number;
  category?: Category;
  description: string;
  merchant: string;
}

@Injectable()
export class AddTransaction {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: AddTransactionInput): Promise<{ transaction: Transaction }> {
    const category =
      input.category ?? (await this.categories.categoryForMerchant(input.merchant)) ?? 'otros';
    const tx: Transaction = {
      id: await this.repo.nextId(),
      date: input.date ?? formatIso(this.clock.now()),
      amount: input.amount,
      currency: 'ARS',
      category,
      description: input.description,
      merchant: input.merchant,
    };
    await this.repo.add(tx);
    return { transaction: tx };
  }
}
```

- [ ] **Step 2: Create `update.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionFields,
  type TransactionsRepository,
} from '../domain/transactions.repository';

export interface UpdateTransactionInput {
  transactionId: string;
  fields: TransactionFields;
}

@Injectable()
export class UpdateTransaction {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
  ) {}

  async execute(input: UpdateTransactionInput): Promise<{ transaction: Transaction }> {
    const tx = await this.repo.update(input.transactionId, input.fields);
    if (!tx) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    return { transaction: tx };
  }
}
```

- [ ] **Step 3: Create `delete.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from '../domain/transactions.repository';

export interface DeleteTransactionInput {
  transactionId: string;
}

@Injectable()
export class DeleteTransaction {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
  ) {}

  async execute(input: DeleteTransactionInput): Promise<{ deletedId: string }> {
    const ok = await this.repo.delete(input.transactionId);
    if (!ok) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    return { deletedId: input.transactionId };
  }
}
```

- [ ] **Step 4: Create `propose-mutation.use-case.ts`** — read-only target resolution.

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionFields,
  type TransactionsRepository,
} from '../domain/transactions.repository';

export interface ProposeMutationInput {
  intent: 'delete' | 'update';
  selector: {
    transactionId?: string;
    merchant?: string;
    category?: Category;
    period?: Period;
  };
  proposedFields?: TransactionFields;
}

@Injectable()
export class ProposeTransactionMutation {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: ProposeMutationInput): Promise<{
    intent: 'delete' | 'update';
    matches: Transaction[];
    proposedFields?: TransactionFields;
  }> {
    const txs = await this.repo.all();
    const sel = input.selector;
    let matches = txs;

    if (sel.transactionId) {
      matches = matches.filter((t) => t.id === sel.transactionId);
    } else {
      if (sel.merchant) {
        const needle = sel.merchant.toLowerCase();
        matches = matches.filter((t) => t.merchant.toLowerCase().includes(needle));
      }
      if (sel.period) {
        const range = this.periods.resolve(sel.period);
        matches = matches.filter((t) => t.date >= range.from && t.date <= range.to);
      }
      if (sel.category) {
        const cats = await this.categories.resolveAll(txs);
        matches = matches.filter((t) => cats.get(t.id) === sel.category);
      }
    }

    return {
      intent: input.intent,
      matches,
      ...(input.proposedFields ? { proposedFields: input.proposedFields } : {}),
    };
  }
}
```

- [ ] **Step 5: Create `transactions.schemas.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const addTransactionInput = z.object({
  date: isoDate.optional(),
  amount: z.number().positive(),
  category: categorySchema.optional(),
  description: z.string().min(1),
  merchant: z.string().min(1),
});

export const transactionFieldsSchema = z
  .object({
    date: isoDate.optional(),
    amount: z.number().positive().optional(),
    category: categorySchema.optional(),
    description: z.string().min(1).optional(),
    merchant: z.string().min(1).optional(),
  })
  .refine((f) => Object.keys(f).length > 0, { message: 'at least one field is required' });

export const updateTransactionInput = z.object({
  transactionId: z.string().min(1),
  fields: transactionFieldsSchema,
});

export const deleteTransactionInput = z.object({
  transactionId: z.string().min(1),
});

export const proposeMutationInput = z.object({
  intent: z.enum(['delete', 'update']),
  selector: z.object({
    transactionId: z.string().optional(),
    merchant: z.string().optional(),
    category: categorySchema.optional(),
    period: periodSchema.optional(),
  }),
  proposedFields: transactionFieldsSchema.optional(),
});
```

- [ ] **Step 6: Create `transactions.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { AddTransaction, type AddTransactionInput } from '../use-cases/add.use-case';
import { UpdateTransaction, type UpdateTransactionInput } from '../use-cases/update.use-case';
import { DeleteTransaction, type DeleteTransactionInput } from '../use-cases/delete.use-case';
import {
  ProposeTransactionMutation,
  type ProposeMutationInput,
} from '../use-cases/propose-mutation.use-case';
import {
  addTransactionInput,
  deleteTransactionInput,
  proposeMutationInput,
  updateTransactionInput,
} from './transactions.schemas';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly propose: ProposeTransactionMutation,
    private readonly add: AddTransaction,
    private readonly update: UpdateTransaction,
    private readonly del: DeleteTransaction,
  ) {}

  @Post('propose-mutation')
  proposeMutation(@Body(new ZodValidationPipe(proposeMutationInput)) body: ProposeMutationInput) {
    return this.propose.execute(body);
  }

  @Post('add')
  addTransaction(@Body(new ZodValidationPipe(addTransactionInput)) body: AddTransactionInput) {
    return this.add.execute(body);
  }

  @Post('update')
  updateTransaction(@Body(new ZodValidationPipe(updateTransactionInput)) body: UpdateTransactionInput) {
    return this.update.execute(body);
  }

  @Post('delete')
  deleteTransaction(@Body(new ZodValidationPipe(deleteTransactionInput)) body: DeleteTransactionInput) {
    return this.del.execute(body);
  }
}
```

- [ ] **Step 7: Replace `transactions.module.ts`** with the full module.

```ts
import { Module } from '@nestjs/common';
import { TRANSACTIONS_REPOSITORY } from './domain/transactions.repository';
import { JsonTransactionsRepository } from './repositories/json-transactions.repository';
import { AddTransaction } from './use-cases/add.use-case';
import { UpdateTransaction } from './use-cases/update.use-case';
import { DeleteTransaction } from './use-cases/delete.use-case';
import { ProposeTransactionMutation } from './use-cases/propose-mutation.use-case';
import { TransactionsController } from './interface/transactions.controller';

@Module({
  controllers: [TransactionsController],
  providers: [
    { provide: TRANSACTIONS_REPOSITORY, useClass: JsonTransactionsRepository },
    AddTransaction,
    UpdateTransaction,
    DeleteTransaction,
    ProposeTransactionMutation,
  ],
  exports: [TRANSACTIONS_REPOSITORY],
})
export class TransactionsModule {}
```

- [ ] **Step 8: Write the failing tests**

`add.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { AddTransaction } from './add.use-case';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';

test('add defaults the date to today and currency to ARS', async () => {
  const repo = fakeTransactionsRepo();
  const useCase = new AddTransaction(
    repo,
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
  );
  const { transaction } = await useCase.execute({
    amount: 3000,
    description: 'Café',
    merchant: 'Starbucks',
    category: 'comida',
  });
  expect(transaction.date).toBe('2026-05-17');
  expect(transaction.currency).toBe('ARS');
  expect((await repo.all())).toHaveLength(1);
});

test('add falls back to a merchant rule, then to otros', async () => {
  const withRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo({ merchants: { Coderhouse: 'educacion' } })),
    fixedClock('2026-05-17'),
  );
  const ruled = await withRule.execute({ amount: 50000, description: 'Curso', merchant: 'Coderhouse' });
  expect(ruled.transaction.category).toBe('educacion');

  const noRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
  );
  const unruled = await noRule.execute({ amount: 1000, description: 'X', merchant: 'Desconocido' });
  expect(unruled.transaction.category).toBe('otros');
});
```

`update.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { UpdateTransaction } from './update.use-case';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeTransactionsRepo } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const seed: Transaction = {
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: 'Almuerzo',
  merchant: 'Rappi',
};

test('update applies the given fields', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]));
  const { transaction } = await useCase.execute({ transactionId: 'txn_001', fields: { amount: 2500 } });
  expect(transaction.amount).toBe(2500);
  expect(transaction.merchant).toBe('Rappi');
});

test('update on an unknown id throws NOT_FOUND', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]));
  await expect(
    useCase.execute({ transactionId: 'txn_999', fields: { amount: 1 } }),
  ).rejects.toThrow(DomainError);
});
```

`delete.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { DeleteTransaction } from './delete.use-case';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeTransactionsRepo } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const seed: Transaction = {
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: 'Almuerzo',
  merchant: 'Rappi',
};

test('delete removes the transaction and returns its id', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const { deletedId } = await new DeleteTransaction(repo).execute({ transactionId: 'txn_001' });
  expect(deletedId).toBe('txn_001');
  expect(await repo.all()).toHaveLength(0);
});

test('delete on an unknown id throws NOT_FOUND', async () => {
  await expect(
    new DeleteTransaction(fakeTransactionsRepo([seed])).execute({ transactionId: 'txn_999' }),
  ).rejects.toThrow(DomainError);
});
```

`propose-mutation.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { ProposeTransactionMutation } from './propose-mutation.use-case';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const tx = (id: string, merchant: string, date: string): Transaction => ({
  id,
  date,
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: '',
  merchant,
});

function build(seed: Transaction[]) {
  return new ProposeTransactionMutation(
    fakeTransactionsRepo(seed),
    new PeriodResolver(fixedClock('2026-05-17')),
    new CategoryResolver(fakeCategorizationRepo()),
  );
}

test('propose resolves matches by merchant', async () => {
  const useCase = build([tx('txn_001', 'Rappi', '2026-05-10'), tx('txn_002', 'Uber', '2026-05-10')]);
  const result = await useCase.execute({ intent: 'delete', selector: { merchant: 'rappi' } });
  expect(result.intent).toBe('delete');
  expect(result.matches.map((m) => m.id)).toEqual(['txn_001']);
});

test('propose returns an empty array when nothing matches', async () => {
  const useCase = build([tx('txn_001', 'Rappi', '2026-05-10')]);
  const result = await useCase.execute({ intent: 'delete', selector: { merchant: 'Nope' } });
  expect(result.matches).toEqual([]);
});
```

- [ ] **Step 9: Run the transactions tests**

Run: `bun test apps/api/src/transactions`
Expected: PASS — 8 tests.

- [ ] **Step 10: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/transactions
git commit -m "feat(api): transaction CRUD use-cases and controller"
```

---

## Task 9: Categorization use-cases, controller & module

**Files:**
- Create: `apps/api/src/categorization/use-cases/override-merchant.use-case.ts`
- Create: `apps/api/src/categorization/use-cases/override-transaction.use-case.ts`
- Create: `apps/api/src/categorization/interface/categorization.schemas.ts`
- Create: `apps/api/src/categorization/interface/categorization.controller.ts`
- Create: `apps/api/src/categorization/categorization.module.ts`
- Test: `apps/api/src/categorization/use-cases/override-merchant.use-case.test.ts`
- Test: `apps/api/src/categorization/use-cases/override-transaction.use-case.test.ts`

- [ ] **Step 1: Create `override-merchant.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../../shared/domain/category';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../../shared/domain/category-overrides';

export interface OverrideMerchantInput {
  merchant: string;
  category: Category;
}

@Injectable()
export class OverrideMerchantCategory {
  constructor(
    @Inject(CATEGORIZATION_REPOSITORY) private readonly repo: CategorizationRepository,
  ) {}

  async execute(input: OverrideMerchantInput): Promise<OverrideMerchantInput> {
    await this.repo.setMerchant(input.merchant, input.category);
    return { merchant: input.merchant, category: input.category };
  }
}
```

- [ ] **Step 2: Create `override-transaction.use-case.ts`** — verifies the transaction exists.

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../../shared/domain/category';
import { DomainError } from '../../shared/domain/domain-error';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../../shared/domain/category-overrides';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface OverrideTransactionInput {
  transactionId: string;
  category: Category;
}

@Injectable()
export class OverrideTransactionCategory {
  constructor(
    @Inject(CATEGORIZATION_REPOSITORY) private readonly repo: CategorizationRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
  ) {}

  async execute(input: OverrideTransactionInput): Promise<OverrideTransactionInput> {
    const exists = (await this.txRepo.all()).some((t) => t.id === input.transactionId);
    if (!exists) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    await this.repo.setTransaction(input.transactionId, input.category);
    return { transactionId: input.transactionId, category: input.category };
  }
}
```

- [ ] **Step 3: Create `categorization.schemas.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const overrideMerchantInput = z.object({
  merchant: z.string().min(1),
  category: categorySchema,
});

export const overrideTransactionInput = z.object({
  transactionId: z.string().min(1),
  category: categorySchema,
});
```

- [ ] **Step 4: Create `categorization.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import {
  OverrideMerchantCategory,
  type OverrideMerchantInput,
} from '../use-cases/override-merchant.use-case';
import {
  OverrideTransactionCategory,
  type OverrideTransactionInput,
} from '../use-cases/override-transaction.use-case';
import { overrideMerchantInput, overrideTransactionInput } from './categorization.schemas';

@Controller('categorization')
export class CategorizationController {
  constructor(
    private readonly merchant: OverrideMerchantCategory,
    private readonly transaction: OverrideTransactionCategory,
  ) {}

  @Post('merchant')
  overrideMerchant(@Body(new ZodValidationPipe(overrideMerchantInput)) body: OverrideMerchantInput) {
    return this.merchant.execute(body);
  }

  @Post('transaction')
  overrideTransaction(
    @Body(new ZodValidationPipe(overrideTransactionInput)) body: OverrideTransactionInput,
  ) {
    return this.transaction.execute(body);
  }
}
```

- [ ] **Step 5: Create `categorization.module.ts`** — the JSON `CATEGORIZATION_REPOSITORY` is already provided globally by `SharedModule`; this module imports `TransactionsModule` for the existence check.

```ts
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { OverrideMerchantCategory } from './use-cases/override-merchant.use-case';
import { OverrideTransactionCategory } from './use-cases/override-transaction.use-case';
import { CategorizationController } from './interface/categorization.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [CategorizationController],
  providers: [OverrideMerchantCategory, OverrideTransactionCategory],
})
export class CategorizationModule {}
```

- [ ] **Step 6: Write the failing tests**

`override-merchant.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { OverrideMerchantCategory } from './override-merchant.use-case';
import { fakeCategorizationRepo } from '../../shared/testing/fakes';

test('override-merchant persists the rule', async () => {
  const repo = fakeCategorizationRepo();
  const result = await new OverrideMerchantCategory(repo).execute({
    merchant: 'Coderhouse',
    category: 'educacion',
  });
  expect(result).toEqual({ merchant: 'Coderhouse', category: 'educacion' });
  expect((await repo.overrides()).merchants.Coderhouse).toBe('educacion');
});
```

`override-transaction.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { OverrideTransactionCategory } from './override-transaction.use-case';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategorizationRepo, fakeTransactionsRepo } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const seed: Transaction = {
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'otros',
  description: '',
  merchant: 'Farmacity',
};

test('override-transaction persists the exception for an existing tx', async () => {
  const cat = fakeCategorizationRepo();
  const useCase = new OverrideTransactionCategory(cat, fakeTransactionsRepo([seed]));
  await useCase.execute({ transactionId: 'txn_001', category: 'salud' });
  expect((await cat.overrides()).transactions.txn_001).toBe('salud');
});

test('override-transaction on an unknown id throws NOT_FOUND', async () => {
  const useCase = new OverrideTransactionCategory(fakeCategorizationRepo(), fakeTransactionsRepo([seed]));
  await expect(
    useCase.execute({ transactionId: 'txn_999', category: 'salud' }),
  ).rejects.toThrow(DomainError);
});
```

- [ ] **Step 7: Run the categorization tests**

Run: `bun test apps/api/src/categorization`
Expected: PASS — 3 tests.

- [ ] **Step 8: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/categorization
git commit -m "feat(api): categorization override use-cases and controller"
```

---

## Task 10: Spending feature

**Files:**
- Create: `apps/api/src/spending/use-cases/sum-by-category.use-case.ts`
- Create: `apps/api/src/spending/use-cases/breakdown.use-case.ts`
- Create: `apps/api/src/spending/use-cases/top-merchants.use-case.ts`
- Create: `apps/api/src/spending/use-cases/list-transactions.use-case.ts`
- Create: `apps/api/src/spending/use-cases/compare.use-case.ts`
- Create: `apps/api/src/spending/interface/spending.schemas.ts`
- Create: `apps/api/src/spending/interface/spending.controller.ts`
- Create: `apps/api/src/spending/spending.module.ts`
- Test: `apps/api/src/spending/use-cases/spending.use-cases.test.ts`

- [ ] **Step 1: Create `sum-by-category.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface SumByCategoryInput {
  category: Category;
  period: Period;
}

@Injectable()
export class SumByCategory {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: SumByCategoryInput) {
    const range = this.periods.resolve(input.period);
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const matching = txs.filter(
      (t) => t.date >= range.from && t.date <= range.to && cats.get(t.id) === input.category,
    );
    return {
      category: input.category,
      total: matching.reduce((s, t) => s + t.amount, 0),
      transactionCount: matching.length,
    };
  }
}
```

- [ ] **Step 2: Create `breakdown.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface BreakdownInput {
  period: Period;
}

@Injectable()
export class GetSpendingBreakdown {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: BreakdownInput) {
    const range = this.periods.resolve(input.period);
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const totals = new Map<Category, number>();
    for (const t of txs) {
      if (t.date < range.from || t.date > range.to) continue;
      const c = cats.get(t.id)!;
      totals.set(c, (totals.get(c) ?? 0) + t.amount);
    }
    const total = [...totals.values()].reduce((s, v) => s + v, 0);
    const breakdown = [...totals.entries()]
      .map(([category, catTotal]) => ({
        category,
        total: catTotal,
        share: total > 0 ? catTotal / total : 0,
      }))
      .sort((a, b) => b.total - a.total);
    return { total, breakdown };
  }
}
```

- [ ] **Step 3: Create `top-merchants.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface TopMerchantsInput {
  period: Period;
  limit?: number;
}

@Injectable()
export class GetTopMerchants {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
  ) {}

  async execute(input: TopMerchantsInput) {
    const range = this.periods.resolve(input.period);
    const txs = (await this.txRepo.all()).filter(
      (t) => t.date >= range.from && t.date <= range.to,
    );
    const byMerchant = new Map<string, { total: number; count: number }>();
    for (const t of txs) {
      const e = byMerchant.get(t.merchant) ?? { total: 0, count: 0 };
      e.total += t.amount;
      e.count += 1;
      byMerchant.set(t.merchant, e);
    }
    const merchants = [...byMerchant.entries()]
      .map(([merchant, e]) => ({ merchant, total: e.total, transactionCount: e.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, input.limit ?? 10);
    return { merchants };
  }
}
```

- [ ] **Step 4: Create `list-transactions.use-case.ts`** — returns transactions with the effective category applied.

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface ListTransactionsInput {
  merchant?: string;
  category?: Category;
  period: Period;
  limit?: number;
}

@Injectable()
export class ListTransactions {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: ListTransactionsInput): Promise<{ transactions: Transaction[]; total: number }> {
    const range = this.periods.resolve(input.period);
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    let matches = txs.filter((t) => t.date >= range.from && t.date <= range.to);
    if (input.merchant) {
      const needle = input.merchant.toLowerCase();
      matches = matches.filter((t) => t.merchant.toLowerCase().includes(needle));
    }
    if (input.category) {
      matches = matches.filter((t) => cats.get(t.id) === input.category);
    }
    matches.sort((a, b) => b.date.localeCompare(a.date));
    const total = matches.reduce((s, t) => s + t.amount, 0);
    const limited = input.limit ? matches.slice(0, input.limit) : matches;
    const transactions = limited.map((t) => ({ ...t, category: cats.get(t.id)! }));
    return { transactions, total };
  }
}
```

- [ ] **Step 5: Create `compare.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { DateRange, Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface CompareInput {
  periodA: Period;
  periodB: Period;
}

@Injectable()
export class CompareSpending {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: CompareInput) {
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const sumByCat = (range: DateRange): Map<Category, number> => {
      const m = new Map<Category, number>();
      for (const t of txs) {
        if (t.date < range.from || t.date > range.to) continue;
        const c = cats.get(t.id)!;
        m.set(c, (m.get(c) ?? 0) + t.amount);
      }
      return m;
    };
    const a = sumByCat(this.periods.resolve(input.periodA));
    const b = sumByCat(this.periods.resolve(input.periodB));
    const categories = [...new Set<Category>([...a.keys(), ...b.keys()])]
      .map((category) => {
        const totalA = a.get(category) ?? 0;
        const totalB = b.get(category) ?? 0;
        const delta = totalB - totalA;
        const deltaPct = totalA > 0 ? (delta / totalA) * 100 : totalB > 0 ? 100 : 0;
        return { category, totalA, totalB, delta, deltaPct };
      })
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    return {
      totalA: [...a.values()].reduce((s, v) => s + v, 0),
      totalB: [...b.values()].reduce((s, v) => s + v, 0),
      categories,
    };
  }
}
```

- [ ] **Step 6: Create `spending.schemas.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';

export const sumByCategoryInput = z.object({ category: categorySchema, period: periodSchema });
export const breakdownInput = z.object({ period: periodSchema });
export const topMerchantsInput = z.object({
  period: periodSchema,
  limit: z.number().int().positive().optional(),
});
export const listTransactionsInput = z.object({
  merchant: z.string().optional(),
  category: categorySchema.optional(),
  period: periodSchema,
  limit: z.number().int().positive().optional(),
});
export const compareInput = z.object({ periodA: periodSchema, periodB: periodSchema });
```

- [ ] **Step 7: Create `spending.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { SumByCategory, type SumByCategoryInput } from '../use-cases/sum-by-category.use-case';
import { GetSpendingBreakdown, type BreakdownInput } from '../use-cases/breakdown.use-case';
import { GetTopMerchants, type TopMerchantsInput } from '../use-cases/top-merchants.use-case';
import { ListTransactions, type ListTransactionsInput } from '../use-cases/list-transactions.use-case';
import { CompareSpending, type CompareInput } from '../use-cases/compare.use-case';
import {
  breakdownInput,
  compareInput,
  listTransactionsInput,
  sumByCategoryInput,
  topMerchantsInput,
} from './spending.schemas';

@Controller('spending')
export class SpendingController {
  constructor(
    private readonly sum: SumByCategory,
    private readonly breakdown: GetSpendingBreakdown,
    private readonly topMerchants: GetTopMerchants,
    private readonly list: ListTransactions,
    private readonly compare: CompareSpending,
  ) {}

  @Post('sum-by-category')
  sumByCategory(@Body(new ZodValidationPipe(sumByCategoryInput)) body: SumByCategoryInput) {
    return this.sum.execute(body);
  }

  @Post('breakdown')
  getBreakdown(@Body(new ZodValidationPipe(breakdownInput)) body: BreakdownInput) {
    return this.breakdown.execute(body);
  }

  @Post('top-merchants')
  getTopMerchants(@Body(new ZodValidationPipe(topMerchantsInput)) body: TopMerchantsInput) {
    return this.topMerchants.execute(body);
  }

  @Post('list-transactions')
  listTransactions(@Body(new ZodValidationPipe(listTransactionsInput)) body: ListTransactionsInput) {
    return this.list.execute(body);
  }

  @Post('compare')
  compareSpending(@Body(new ZodValidationPipe(compareInput)) body: CompareInput) {
    return this.compare.execute(body);
  }
}
```

- [ ] **Step 8: Create `spending.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { SumByCategory } from './use-cases/sum-by-category.use-case';
import { GetSpendingBreakdown } from './use-cases/breakdown.use-case';
import { GetTopMerchants } from './use-cases/top-merchants.use-case';
import { ListTransactions } from './use-cases/list-transactions.use-case';
import { CompareSpending } from './use-cases/compare.use-case';
import { SpendingController } from './interface/spending.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [SpendingController],
  providers: [SumByCategory, GetSpendingBreakdown, GetTopMerchants, ListTransactions, CompareSpending],
})
export class SpendingModule {}
```

- [ ] **Step 9: Write the failing tests** — `spending.use-cases.test.ts`

```ts
import { test, expect } from 'bun:test';
import { SumByCategory } from './sum-by-category.use-case';
import { GetSpendingBreakdown } from './breakdown.use-case';
import { GetTopMerchants } from './top-merchants.use-case';
import { CompareSpending } from './compare.use-case';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const tx = (
  id: string,
  date: string,
  amount: number,
  category: Transaction['category'],
  merchant: string,
): Transaction => ({ id, date, amount, currency: 'ARS', category, description: '', merchant });

const seed: Transaction[] = [
  tx('txn_001', '2026-05-02', 4000, 'comida', 'Rappi'),
  tx('txn_002', '2026-05-03', 6000, 'comida', 'Coto'),
  tx('txn_003', '2026-05-04', 2000, 'transporte', 'Uber'),
  tx('txn_004', '2026-04-10', 9000, 'comida', 'Coto'),
];

const periods = new PeriodResolver(fixedClock('2026-05-17'));
const categories = new CategoryResolver(fakeCategorizationRepo());

test('sum-by-category totals one category for the current month', async () => {
  const result = await new SumByCategory(fakeTransactionsRepo(seed), periods, categories).execute({
    category: 'comida',
    period: { kind: 'currentMonth' },
  });
  expect(result).toEqual({ category: 'comida', total: 10000, transactionCount: 2 });
});

test('breakdown ranks categories by total with shares summing to 1', async () => {
  const result = await new GetSpendingBreakdown(fakeTransactionsRepo(seed), periods, categories).execute({
    period: { kind: 'currentMonth' },
  });
  expect(result.total).toBe(12000);
  expect(result.breakdown[0]).toEqual({ category: 'comida', total: 10000, share: 10000 / 12000 });
});

test('top-merchants ranks merchants by total spend', async () => {
  const result = await new GetTopMerchants(fakeTransactionsRepo(seed), periods).execute({
    period: { kind: 'currentMonth' },
  });
  expect(result.merchants[0]).toEqual({ merchant: 'Coto', total: 6000, transactionCount: 1 });
});

test('compare reports per-category deltas between two periods', async () => {
  const result = await new CompareSpending(fakeTransactionsRepo(seed), periods, categories).execute({
    periodA: { kind: 'calendarMonth', month: '2026-04' },
    periodB: { kind: 'calendarMonth', month: '2026-05' },
  });
  expect(result.totalA).toBe(9000);
  expect(result.totalB).toBe(12000);
  const comida = result.categories.find((c) => c.category === 'comida');
  expect(comida).toEqual({ category: 'comida', totalA: 9000, totalB: 10000, delta: 1000, deltaPct: (1000 / 9000) * 100 });
});

test('an override moves spend into the corrected category', async () => {
  const withOverride = new CategoryResolver(
    fakeCategorizationRepo({ merchants: { Uber: 'comida' } }),
  );
  const result = await new SumByCategory(fakeTransactionsRepo(seed), periods, withOverride).execute({
    category: 'comida',
    period: { kind: 'currentMonth' },
  });
  expect(result.total).toBe(12000);
});
```

- [ ] **Step 10: Run the spending tests**

Run: `bun test apps/api/src/spending`
Expected: PASS — 5 tests.

- [ ] **Step 11: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/spending
git commit -m "feat(api): spending Q&A feature"
```

---

## Task 11: Insights feature

**Files:**
- Create: `apps/api/src/insights/use-cases/project-month-end.use-case.ts`
- Create: `apps/api/src/insights/use-cases/recurring-charges.use-case.ts`
- Create: `apps/api/src/insights/use-cases/category-spikes.use-case.ts`
- Create: `apps/api/src/insights/interface/insights.schemas.ts`
- Create: `apps/api/src/insights/interface/insights.controller.ts`
- Create: `apps/api/src/insights/insights.module.ts`
- Test: `apps/api/src/insights/use-cases/insights.use-cases.test.ts`

- [ ] **Step 1: Create `project-month-end.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { daysInMonth, formatIso, startOfMonth } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface ProjectMonthEndInput {
  category?: Category;
}

@Injectable()
export class ProjectMonthEnd {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ProjectMonthEndInput) {
    const now = this.clock.now();
    const from = startOfMonth(now);
    const today = formatIso(now);
    const daysElapsed = now.getUTCDate();
    const total = daysInMonth(now);

    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    let inRange = txs.filter((t) => t.date >= from && t.date <= today);
    if (input.category) {
      inRange = inRange.filter((t) => cats.get(t.id) === input.category);
    }
    const spentSoFar = inRange.reduce((s, t) => s + t.amount, 0);
    const projectedTotal = daysElapsed > 0 ? Math.round((spentSoFar / daysElapsed) * total) : 0;
    const caveat =
      daysElapsed < 5 || inRange.length < 5
        ? 'Proyección con muestra chica; tomala como referencia, no como número firme.'
        : null;

    return { daysElapsed, daysInMonth: total, spentSoFar, projectedTotal, caveat };
  }
}
```

- [ ] **Step 2: Create `recurring-charges.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { addMonths, formatIso, startOfMonth } from '../../shared/domain/dates';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface RecurringChargesInput {
  lookbackMonths?: number;
}

@Injectable()
export class DetectRecurringCharges {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RecurringChargesInput) {
    const lookback = input.lookbackMonths ?? 3;
    const now = this.clock.now();
    const from = startOfMonth(addMonths(now, -(lookback - 1)));
    const to = formatIso(now);

    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const windowed = txs.filter((t) => t.date >= from && t.date <= to);

    const byMerchant = new Map<string, Transaction[]>();
    for (const t of windowed) {
      const list = byMerchant.get(t.merchant) ?? [];
      list.push(t);
      byMerchant.set(t.merchant, list);
    }

    const recurring = [];
    for (const [merchant, list] of byMerchant) {
      const months = new Set(list.map((t) => t.date.slice(0, 7)));
      if (months.size < 2) continue;
      const avg = list.reduce((s, t) => s + t.amount, 0) / list.length;
      if (!list.every((t) => Math.abs(t.amount - avg) <= avg * 0.15)) continue;
      recurring.push({
        merchant,
        category: cats.get(list[0].id)!,
        typicalAmount: Math.round(avg),
        cadence: 'monthly',
        occurrences: list.length,
        lastSeen: list.reduce((m, t) => (t.date > m ? t.date : m), list[0].date),
      });
    }
    recurring.sort((a, b) => b.typicalAmount - a.typicalAmount);
    return { recurring };
  }
}
```

- [ ] **Step 3: Create `category-spikes.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { addMonths, calendarMonthRange, monthKey } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type { DateRange } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

@Injectable()
export class DetectCategorySpikes {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute() {
    const now = this.clock.now();
    const current = calendarMonthRange(monthKey(now));
    const prior = calendarMonthRange(monthKey(addMonths(now, -1)));

    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const sum = (range: DateRange): Map<Category, number> => {
      const m = new Map<Category, number>();
      for (const t of txs) {
        if (t.date < range.from || t.date > range.to) continue;
        const c = cats.get(t.id)!;
        m.set(c, (m.get(c) ?? 0) + t.amount);
      }
      return m;
    };
    const cur = sum(current);
    const pri = sum(prior);

    const spikes = [];
    for (const [category, currentTotal] of cur) {
      const priorTotal = pri.get(category) ?? 0;
      const delta = currentTotal - priorTotal;
      const deltaPct = priorTotal > 0 ? (delta / priorTotal) * 100 : 100;
      if (deltaPct >= 40 && delta >= 10000) {
        spikes.push({ category, currentTotal, priorTotal, delta, deltaPct });
      }
    }
    spikes.sort((a, b) => b.delta - a.delta);
    return { spikes };
  }
}
```

- [ ] **Step 4: Create `insights.schemas.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const projectMonthEndInput = z.object({ category: categorySchema.optional() });
export const recurringChargesInput = z.object({
  lookbackMonths: z.number().int().positive().optional(),
});
export const categorySpikesInput = z.object({});
```

- [ ] **Step 5: Create `insights.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { ProjectMonthEnd, type ProjectMonthEndInput } from '../use-cases/project-month-end.use-case';
import {
  DetectRecurringCharges,
  type RecurringChargesInput,
} from '../use-cases/recurring-charges.use-case';
import { DetectCategorySpikes } from '../use-cases/category-spikes.use-case';
import { categorySpikesInput, projectMonthEndInput, recurringChargesInput } from './insights.schemas';

@Controller('insights')
export class InsightsController {
  constructor(
    private readonly project: ProjectMonthEnd,
    private readonly recurring: DetectRecurringCharges,
    private readonly spikes: DetectCategorySpikes,
  ) {}

  @Post('project-month-end')
  projectMonthEnd(@Body(new ZodValidationPipe(projectMonthEndInput)) body: ProjectMonthEndInput) {
    return this.project.execute(body);
  }

  @Post('recurring-charges')
  recurringCharges(@Body(new ZodValidationPipe(recurringChargesInput)) body: RecurringChargesInput) {
    return this.recurring.execute(body);
  }

  @Post('category-spikes')
  categorySpikes(@Body(new ZodValidationPipe(categorySpikesInput)) _body: Record<string, never>) {
    return this.spikes.execute();
  }
}
```

- [ ] **Step 6: Create `insights.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { ProjectMonthEnd } from './use-cases/project-month-end.use-case';
import { DetectRecurringCharges } from './use-cases/recurring-charges.use-case';
import { DetectCategorySpikes } from './use-cases/category-spikes.use-case';
import { InsightsController } from './interface/insights.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [InsightsController],
  providers: [ProjectMonthEnd, DetectRecurringCharges, DetectCategorySpikes],
})
export class InsightsModule {}
```

- [ ] **Step 7: Write the failing tests** — `insights.use-cases.test.ts`

```ts
import { test, expect } from 'bun:test';
import { ProjectMonthEnd } from './project-month-end.use-case';
import { DetectRecurringCharges } from './recurring-charges.use-case';
import { DetectCategorySpikes } from './category-spikes.use-case';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const tx = (
  id: string,
  date: string,
  amount: number,
  category: Transaction['category'],
  merchant: string,
): Transaction => ({ id, date, amount, currency: 'ARS', category, description: '', merchant });

const categories = new CategoryResolver(fakeCategorizationRepo());

test('project-month-end extrapolates and flags a thin sample', async () => {
  const seed = [tx('txn_001', '2026-05-02', 10000, 'comida', 'Coto')];
  const result = await new ProjectMonthEnd(
    fakeTransactionsRepo(seed),
    categories,
    fixedClock('2026-05-10'),
  ).execute({});
  // 10000 spent over 10 days, projected across 31 days
  expect(result.spentSoFar).toBe(10000);
  expect(result.daysElapsed).toBe(10);
  expect(result.daysInMonth).toBe(31);
  expect(result.projectedTotal).toBe(Math.round((10000 / 10) * 31));
  expect(result.caveat).not.toBeNull(); // fewer than 5 transactions
});

test('recurring-charges flags a merchant seen across months with stable amounts', async () => {
  const seed = [
    tx('txn_001', '2026-03-05', 5000, 'entretenimiento', 'Netflix'),
    tx('txn_002', '2026-04-05', 5000, 'entretenimiento', 'Netflix'),
    tx('txn_003', '2026-05-05', 5200, 'entretenimiento', 'Netflix'),
    tx('txn_004', '2026-05-06', 3000, 'comida', 'Rappi'),
  ];
  const result = await new DetectRecurringCharges(
    fakeTransactionsRepo(seed),
    categories,
    fixedClock('2026-05-17'),
  ).execute({});
  expect(result.recurring).toHaveLength(1);
  expect(result.recurring[0].merchant).toBe('Netflix');
  expect(result.recurring[0].occurrences).toBe(3);
});

test('category-spikes flags a category that jumped sharply month-over-month', async () => {
  const seed = [
    tx('txn_001', '2026-04-10', 5000, 'entretenimiento', 'Cine'),
    tx('txn_002', '2026-05-10', 40000, 'entretenimiento', 'Recital'),
  ];
  const result = await new DetectCategorySpikes(
    fakeTransactionsRepo(seed),
    categories,
    fixedClock('2026-05-17'),
  ).execute();
  expect(result.spikes).toHaveLength(1);
  expect(result.spikes[0].category).toBe('entretenimiento');
  expect(result.spikes[0].delta).toBe(35000);
});
```

- [ ] **Step 8: Run the insights tests**

Run: `bun test apps/api/src/insights`
Expected: PASS — 3 tests.

- [ ] **Step 9: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/insights
git commit -m "feat(api): proactive insights feature"
```

---

## Task 12: Budgets feature

**Files:**
- Create: `apps/api/src/budgets/domain/budgets.repository.ts`
- Create: `apps/api/src/budgets/repositories/json-budgets.repository.ts`
- Create: `apps/api/src/budgets/use-cases/set-budget.use-case.ts`
- Create: `apps/api/src/budgets/use-cases/clear-budget.use-case.ts`
- Create: `apps/api/src/budgets/use-cases/budget-progress.use-case.ts`
- Create: `apps/api/src/budgets/interface/budgets.schemas.ts`
- Create: `apps/api/src/budgets/interface/budgets.controller.ts`
- Create: `apps/api/src/budgets/budgets.module.ts`
- Test: `apps/api/src/budgets/use-cases/budgets.use-cases.test.ts`

- [ ] **Step 1: Create `budgets.repository.ts`**

```ts
import type { Category } from '../../shared/domain/category';

export const BUDGETS_REPOSITORY = 'BUDGETS_REPOSITORY';

export interface BudgetsRepository {
  /** Budgeted amounts for one `yyyy-MM`, keyed by category. */
  forMonth(month: string): Promise<Partial<Record<Category, number>>>;
  set(month: string, category: Category, amount: number): Promise<void>;
  clear(month: string, category: Category): Promise<void>;
}
```

- [ ] **Step 2: Create `json-budgets.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { Category } from '../../shared/domain/category';
import type { BudgetsRepository } from '../domain/budgets.repository';

type BudgetsData = Record<string, Record<string, number>>;

@Injectable()
export class JsonBudgetsRepository implements BudgetsRepository {
  private readonly store: JsonStore<BudgetsData> = createJsonStore<BudgetsData>(
    path.join(DATA_DIR, 'budgets.json'),
    {},
  );

  async forMonth(month: string): Promise<Partial<Record<Category, number>>> {
    return ((await this.store.read())[month] ?? {}) as Partial<Record<Category, number>>;
  }

  async set(month: string, category: Category, amount: number): Promise<void> {
    const data = await this.store.read();
    data[month] = { ...(data[month] ?? {}), [category]: amount };
    await this.store.write(data);
  }

  async clear(month: string, category: Category): Promise<void> {
    const data = await this.store.read();
    if (data[month]) delete data[month][category];
    await this.store.write(data);
  }
}
```

- [ ] **Step 3: Create `set-budget.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { monthKey } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../domain/budgets.repository';

export interface SetBudgetInput {
  category: Category;
  amount: number;
}

@Injectable()
export class SetBudget {
  constructor(
    @Inject(BUDGETS_REPOSITORY) private readonly repo: BudgetsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SetBudgetInput) {
    const month = monthKey(this.clock.now());
    await this.repo.set(month, input.category, input.amount);
    return { category: input.category, amount: input.amount, month };
  }
}
```

- [ ] **Step 4: Create `clear-budget.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { monthKey } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../domain/budgets.repository';

export interface ClearBudgetInput {
  category: Category;
}

@Injectable()
export class ClearBudget {
  constructor(
    @Inject(BUDGETS_REPOSITORY) private readonly repo: BudgetsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ClearBudgetInput) {
    await this.repo.clear(monthKey(this.clock.now()), input.category);
    return { category: input.category, cleared: true };
  }
}
```

- [ ] **Step 5: Create `budget-progress.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { daysInMonth, formatIso, monthKey, startOfMonth } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../domain/budgets.repository';

export interface BudgetProgressInput {
  category?: Category;
}

@Injectable()
export class GetBudgetProgress {
  constructor(
    @Inject(BUDGETS_REPOSITORY) private readonly budgets: BudgetsRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: BudgetProgressInput) {
    const now = this.clock.now();
    const from = startOfMonth(now);
    const today = formatIso(now);
    const daysElapsed = now.getUTCDate();
    const dim = daysInMonth(now);

    const budgets = await this.budgets.forMonth(monthKey(now));
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const spentByCat = new Map<Category, number>();
    for (const t of txs) {
      if (t.date < from || t.date > today) continue;
      const c = cats.get(t.id)!;
      spentByCat.set(c, (spentByCat.get(c) ?? 0) + t.amount);
    }

    let entries = Object.entries(budgets) as [Category, number][];
    if (input.category) entries = entries.filter(([c]) => c === input.category);

    const items = entries.map(([category, budget]) => {
      const spent = spentByCat.get(category) ?? 0;
      const remaining = budget - spent;
      const projected = daysElapsed > 0 ? Math.round((spent / daysElapsed) * dim) : 0;
      const pace: 'under' | 'on' | 'over' =
        projected < budget * 0.95 ? 'under' : projected > budget * 1.05 ? 'over' : 'on';
      return { category, budget, spent, remaining, pace, projected };
    });
    return { items };
  }
}
```

- [ ] **Step 6: Create `budgets.schemas.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const setBudgetInput = z.object({
  category: categorySchema,
  amount: z.number().positive(),
});
export const clearBudgetInput = z.object({ category: categorySchema });
export const budgetProgressInput = z.object({ category: categorySchema.optional() });
```

- [ ] **Step 7: Create `budgets.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { SetBudget, type SetBudgetInput } from '../use-cases/set-budget.use-case';
import { ClearBudget, type ClearBudgetInput } from '../use-cases/clear-budget.use-case';
import { GetBudgetProgress, type BudgetProgressInput } from '../use-cases/budget-progress.use-case';
import { budgetProgressInput, clearBudgetInput, setBudgetInput } from './budgets.schemas';

@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly setBudget: SetBudget,
    private readonly clearBudget: ClearBudget,
    private readonly progress: GetBudgetProgress,
  ) {}

  @Post('set')
  set(@Body(new ZodValidationPipe(setBudgetInput)) body: SetBudgetInput) {
    return this.setBudget.execute(body);
  }

  @Post('clear')
  clear(@Body(new ZodValidationPipe(clearBudgetInput)) body: ClearBudgetInput) {
    return this.clearBudget.execute(body);
  }

  @Post('progress')
  getProgress(@Body(new ZodValidationPipe(budgetProgressInput)) body: BudgetProgressInput) {
    return this.progress.execute(body);
  }
}
```

- [ ] **Step 8: Create `budgets.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BUDGETS_REPOSITORY } from './domain/budgets.repository';
import { JsonBudgetsRepository } from './repositories/json-budgets.repository';
import { SetBudget } from './use-cases/set-budget.use-case';
import { ClearBudget } from './use-cases/clear-budget.use-case';
import { GetBudgetProgress } from './use-cases/budget-progress.use-case';
import { BudgetsController } from './interface/budgets.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [BudgetsController],
  providers: [
    { provide: BUDGETS_REPOSITORY, useClass: JsonBudgetsRepository },
    SetBudget,
    ClearBudget,
    GetBudgetProgress,
  ],
})
export class BudgetsModule {}
```

- [ ] **Step 9: Write the failing tests** — `budgets.use-cases.test.ts`

```ts
import { test, expect } from 'bun:test';
import { SetBudget } from './set-budget.use-case';
import { GetBudgetProgress } from './budget-progress.use-case';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { BudgetsRepository } from '../domain/budgets.repository';
import type { Category } from '../../shared/domain/category';
import type { Transaction } from '../../shared/domain/transaction';

function fakeBudgetsRepo(seed: Record<string, Record<string, number>> = {}): BudgetsRepository {
  const data = JSON.parse(JSON.stringify(seed)) as Record<string, Record<string, number>>;
  return {
    async forMonth(month) {
      return (data[month] ?? {}) as Partial<Record<Category, number>>;
    },
    async set(month, category, amount) {
      data[month] = { ...(data[month] ?? {}), [category]: amount };
    },
    async clear(month, category) {
      if (data[month]) delete data[month][category];
    },
  };
}

const tx = (id: string, date: string, amount: number): Transaction => ({
  id,
  date,
  amount,
  currency: 'ARS',
  category: 'comida',
  description: '',
  merchant: 'Coto',
});

test('set-budget stores the amount under the current month', async () => {
  const repo = fakeBudgetsRepo();
  const result = await new SetBudget(repo, fixedClock('2026-05-17')).execute({
    category: 'comida',
    amount: 50000,
  });
  expect(result).toEqual({ category: 'comida', amount: 50000, month: '2026-05' });
  expect(await repo.forMonth('2026-05')).toEqual({ comida: 50000 });
});

test('budget-progress reports spend, remaining and pace', async () => {
  const budgets = fakeBudgetsRepo({ '2026-05': { comida: 50000 } });
  // 20000 spent over 10 elapsed days → projected 20000/10*31 = 62000 → over
  const txs = fakeTransactionsRepo([tx('txn_001', '2026-05-03', 8000), tx('txn_002', '2026-05-08', 12000)]);
  const result = await new GetBudgetProgress(
    budgets,
    txs,
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-10'),
  ).execute({});
  expect(result.items).toHaveLength(1);
  expect(result.items[0].spent).toBe(20000);
  expect(result.items[0].remaining).toBe(30000);
  expect(result.items[0].pace).toBe('over');
});
```

- [ ] **Step 10: Run the budgets tests**

Run: `bun test apps/api/src/budgets`
Expected: PASS — 2 tests.

- [ ] **Step 11: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/budgets
git commit -m "feat(api): budget coaching feature"
```

---

## Task 13: Income feature

**Files:**
- Create: `apps/api/src/income/domain/income.repository.ts`
- Create: `apps/api/src/income/repositories/json-income.repository.ts`
- Create: `apps/api/src/income/use-cases/declare-income.use-case.ts`
- Create: `apps/api/src/income/use-cases/cash-flow.use-case.ts`
- Create: `apps/api/src/income/interface/income.schemas.ts`
- Create: `apps/api/src/income/interface/income.controller.ts`
- Create: `apps/api/src/income/income.module.ts`
- Test: `apps/api/src/income/use-cases/income.use-cases.test.ts`

- [ ] **Step 1: Create `income.repository.ts`**

```ts
export const INCOME_REPOSITORY = 'INCOME_REPOSITORY';

export interface OneOffIncome {
  amount: number;
  date: string;
  description: string;
}

export interface IncomeStatement {
  recurringMonthly: number | null;
  oneOffs: OneOffIncome[];
}

export interface IncomeRepository {
  get(): Promise<IncomeStatement>;
  setRecurring(amount: number): Promise<void>;
  addOneOff(entry: OneOffIncome): Promise<void>;
}
```

- [ ] **Step 2: Create `json-income.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { IncomeRepository, IncomeStatement, OneOffIncome } from '../domain/income.repository';

@Injectable()
export class JsonIncomeRepository implements IncomeRepository {
  private readonly store: JsonStore<IncomeStatement> = createJsonStore<IncomeStatement>(
    path.join(DATA_DIR, 'income.json'),
    { recurringMonthly: null, oneOffs: [] },
  );

  get(): Promise<IncomeStatement> {
    return this.store.read();
  }

  async setRecurring(amount: number): Promise<void> {
    const data = await this.store.read();
    data.recurringMonthly = amount;
    await this.store.write(data);
  }

  async addOneOff(entry: OneOffIncome): Promise<void> {
    const data = await this.store.read();
    data.oneOffs.push(entry);
    await this.store.write(data);
  }
}
```

- [ ] **Step 3: Create `declare-income.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { formatIso } from '../../shared/domain/dates';
import { INCOME_REPOSITORY, type IncomeRepository } from '../domain/income.repository';

export interface DeclareIncomeInput {
  kind: 'recurring' | 'oneOff';
  amount: number;
  date?: string;
  description?: string;
}

@Injectable()
export class DeclareIncome {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly repo: IncomeRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: DeclareIncomeInput) {
    if (input.kind === 'recurring') {
      await this.repo.setRecurring(input.amount);
      return { kind: 'recurring' as const, amount: input.amount };
    }
    const entry = {
      amount: input.amount,
      date: input.date ?? formatIso(this.clock.now()),
      description: input.description ?? '',
    };
    await this.repo.addOneOff(entry);
    return { kind: 'oneOff' as const, ...entry };
  }
}
```

- [ ] **Step 4: Create `cash-flow.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { daysBetween } from '../../shared/domain/dates';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { INCOME_REPOSITORY, type IncomeRepository } from '../domain/income.repository';

export interface CashFlowInput {
  period: Period;
}

@Injectable()
export class GetCashFlow {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
  ) {}

  async execute(input: CashFlowInput) {
    const range = this.periods.resolve(input.period);
    const periodDays = daysBetween(range.from, range.to) + 1;

    const stmt = await this.income.get();
    const recurring = stmt.recurringMonthly ? (stmt.recurringMonthly * periodDays) / 30 : 0;
    const oneOffs = stmt.oneOffs
      .filter((o) => o.date >= range.from && o.date <= range.to)
      .reduce((s, o) => s + o.amount, 0);
    const income = Math.round(recurring + oneOffs);

    const expenses = (await this.txRepo.all())
      .filter((t) => t.date >= range.from && t.date <= range.to)
      .reduce((s, t) => s + t.amount, 0);

    const net = income - expenses;
    const savingsRate = income > 0 ? net / income : null;
    return { income, expenses, net, savingsRate };
  }
}
```

- [ ] **Step 5: Create `income.schemas.ts`**

```ts
import { z } from 'zod';
import { periodSchema } from '../../shared/domain/period';

export const declareIncomeInput = z.object({
  kind: z.enum(['recurring', 'oneOff']),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});

export const cashFlowInput = z.object({ period: periodSchema });
```

- [ ] **Step 6: Create `income.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { DeclareIncome, type DeclareIncomeInput } from '../use-cases/declare-income.use-case';
import { GetCashFlow, type CashFlowInput } from '../use-cases/cash-flow.use-case';
import { cashFlowInput, declareIncomeInput } from './income.schemas';

@Controller('income')
export class IncomeController {
  constructor(
    private readonly declare: DeclareIncome,
    private readonly cashFlow: GetCashFlow,
  ) {}

  @Post('declare')
  declareIncome(@Body(new ZodValidationPipe(declareIncomeInput)) body: DeclareIncomeInput) {
    return this.declare.execute(body);
  }

  @Post('cash-flow')
  getCashFlow(@Body(new ZodValidationPipe(cashFlowInput)) body: CashFlowInput) {
    return this.cashFlow.execute(body);
  }
}
```

- [ ] **Step 7: Create `income.module.ts`** — exports `INCOME_REPOSITORY` so the goals feature can reuse it.

```ts
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { INCOME_REPOSITORY } from './domain/income.repository';
import { JsonIncomeRepository } from './repositories/json-income.repository';
import { DeclareIncome } from './use-cases/declare-income.use-case';
import { GetCashFlow } from './use-cases/cash-flow.use-case';
import { IncomeController } from './interface/income.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [IncomeController],
  providers: [
    { provide: INCOME_REPOSITORY, useClass: JsonIncomeRepository },
    DeclareIncome,
    GetCashFlow,
  ],
  exports: [INCOME_REPOSITORY],
})
export class IncomeModule {}
```

- [ ] **Step 8: Write the failing tests** — `income.use-cases.test.ts`

```ts
import { test, expect } from 'bun:test';
import { DeclareIncome } from './declare-income.use-case';
import { GetCashFlow } from './cash-flow.use-case';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { IncomeRepository, IncomeStatement } from '../domain/income.repository';
import type { Transaction } from '../../shared/domain/transaction';

function fakeIncomeRepo(seed?: Partial<IncomeStatement>): IncomeRepository {
  const data: IncomeStatement = {
    recurringMonthly: seed?.recurringMonthly ?? null,
    oneOffs: seed?.oneOffs ? [...seed.oneOffs] : [],
  };
  return {
    async get() {
      return { recurringMonthly: data.recurringMonthly, oneOffs: [...data.oneOffs] };
    },
    async setRecurring(amount) {
      data.recurringMonthly = amount;
    },
    async addOneOff(entry) {
      data.oneOffs.push(entry);
    },
  };
}

const tx = (id: string, date: string, amount: number): Transaction => ({
  id,
  date,
  amount,
  currency: 'ARS',
  category: 'comida',
  description: '',
  merchant: 'Coto',
});

test('declare recurring income sets the monthly figure', async () => {
  const repo = fakeIncomeRepo();
  const result = await new DeclareIncome(repo, fixedClock('2026-05-17')).execute({
    kind: 'recurring',
    amount: 1_500_000,
  });
  expect(result).toEqual({ kind: 'recurring', amount: 1_500_000 });
  expect((await repo.get()).recurringMonthly).toBe(1_500_000);
});

test('cash-flow returns a null savings rate when no income is declared', async () => {
  const result = await new GetCashFlow(
    fakeIncomeRepo(),
    fakeTransactionsRepo([tx('txn_001', '2026-05-05', 10000)]),
    new PeriodResolver(fixedClock('2026-05-17')),
  ).execute({ period: { kind: 'calendarMonth', month: '2026-05' } });
  expect(result.expenses).toBe(10000);
  expect(result.income).toBe(0);
  expect(result.savingsRate).toBeNull();
});

test('cash-flow computes net and savings rate from a full calendar month of recurring income', async () => {
  const result = await new GetCashFlow(
    fakeIncomeRepo({ recurringMonthly: 600_000 }),
    fakeTransactionsRepo([tx('txn_001', '2026-04-05', 300_000)]),
    new PeriodResolver(fixedClock('2026-05-17')),
  ).execute({ period: { kind: 'calendarMonth', month: '2026-04' } });
  // April = 30 days → recurring 600000 * 30/30 = 600000
  expect(result.income).toBe(600_000);
  expect(result.net).toBe(300_000);
  expect(result.savingsRate).toBe(0.5);
});
```

- [ ] **Step 9: Run the income tests**

Run: `bun test apps/api/src/income`
Expected: PASS — 3 tests.

- [ ] **Step 10: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/income
git commit -m "feat(api): income and cash-flow feature"
```

---

## Task 14: Goals feature

**Files:**
- Create: `apps/api/src/goals/domain/goals.repository.ts`
- Create: `apps/api/src/goals/repositories/json-goals.repository.ts`
- Create: `apps/api/src/goals/use-cases/set-goal.use-case.ts`
- Create: `apps/api/src/goals/use-cases/list-goals.use-case.ts`
- Create: `apps/api/src/goals/use-cases/clear-goal.use-case.ts`
- Create: `apps/api/src/goals/use-cases/goal-progress.use-case.ts`
- Create: `apps/api/src/goals/use-cases/assess-goal-risk.use-case.ts`
- Create: `apps/api/src/goals/interface/goals.schemas.ts`
- Create: `apps/api/src/goals/interface/goals.controller.ts`
- Create: `apps/api/src/goals/goals.module.ts`
- Test: `apps/api/src/goals/use-cases/goals.use-cases.test.ts`

- [ ] **Step 1: Create `goals.repository.ts`**

```ts
import type { Goal } from '../../shared/domain/goal';

export const GOALS_REPOSITORY = 'GOALS_REPOSITORY';

export type GoalDraft = Omit<Goal, 'id' | 'createdAt'>;

export interface GoalsRepository {
  all(): Promise<Goal[]>;
  getById(id: string): Promise<Goal | null>;
  /** Upsert by case-insensitive name: same name updates, otherwise creates. */
  upsertByName(draft: GoalDraft, createdAt: string): Promise<Goal>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 2: Create `json-goals.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { Goal } from '../../shared/domain/goal';
import type { GoalDraft, GoalsRepository } from '../domain/goals.repository';

@Injectable()
export class JsonGoalsRepository implements GoalsRepository {
  private readonly store: JsonStore<Goal[]> = createJsonStore<Goal[]>(
    path.join(DATA_DIR, 'goals.json'),
    [],
  );

  all(): Promise<Goal[]> {
    return this.store.read();
  }

  async getById(id: string): Promise<Goal | null> {
    return (await this.store.read()).find((g) => g.id === id) ?? null;
  }

  async upsertByName(draft: GoalDraft, createdAt: string): Promise<Goal> {
    const goals = await this.store.read();
    const index = goals.findIndex((g) => g.name.toLowerCase() === draft.name.toLowerCase());
    let goal: Goal;
    if (index >= 0) {
      goal = { ...goals[index], ...draft };
      goals[index] = goal;
    } else {
      const max = goals.reduce((m, g) => {
        const n = Number(g.id.replace(/\D/g, ''));
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      goal = { id: `goal_${String(max + 1).padStart(3, '0')}`, createdAt, ...draft };
      goals.push(goal);
    }
    await this.store.write(goals);
    return goal;
  }

  async delete(id: string): Promise<boolean> {
    const goals = await this.store.read();
    const next = goals.filter((g) => g.id !== id);
    if (next.length === goals.length) return false;
    await this.store.write(next);
    return true;
  }
}
```

- [ ] **Step 3: Create `set-goal.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { formatIso } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type { Goal } from '../../shared/domain/goal';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

export interface SetGoalInput {
  name: string;
  targetAmount: number;
  targetDate: string;
  linkedCategory?: Category;
}

@Injectable()
export class SetGoal {
  constructor(
    @Inject(GOALS_REPOSITORY) private readonly repo: GoalsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SetGoalInput): Promise<{ goal: Goal }> {
    const goal = await this.repo.upsertByName(
      {
        name: input.name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate,
        linkedCategory: input.linkedCategory ?? null,
      },
      formatIso(this.clock.now()),
    );
    return { goal };
  }
}
```

- [ ] **Step 4: Create `list-goals.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Goal } from '../../shared/domain/goal';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

@Injectable()
export class ListGoals {
  constructor(@Inject(GOALS_REPOSITORY) private readonly repo: GoalsRepository) {}

  async execute(): Promise<{ goals: Goal[] }> {
    return { goals: await this.repo.all() };
  }
}
```

- [ ] **Step 5: Create `clear-goal.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

export interface ClearGoalInput {
  goalId: string;
}

@Injectable()
export class ClearGoal {
  constructor(@Inject(GOALS_REPOSITORY) private readonly repo: GoalsRepository) {}

  async execute(input: ClearGoalInput) {
    const ok = await this.repo.delete(input.goalId);
    if (!ok) throw new DomainError('NOT_FOUND', `Objetivo ${input.goalId} no encontrado.`);
    return { goalId: input.goalId, cleared: true };
  }
}
```

- [ ] **Step 6: Create `goal-progress.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { DomainError } from '../../shared/domain/domain-error';
import { addMonths, formatIso, monthsBetween } from '../../shared/domain/dates';
import type { Goal } from '../../shared/domain/goal';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { INCOME_REPOSITORY, type IncomeRepository } from '../../income/domain/income.repository';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

export interface GoalProgressInput {
  goalId?: string;
}

@Injectable()
export class GetGoalProgress {
  constructor(
    @Inject(GOALS_REPOSITORY) private readonly goalsRepo: GoalsRepository,
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: GoalProgressInput) {
    const goals = input.goalId ? [await this.requireGoal(input.goalId)] : await this.goalsRepo.all();
    const now = this.clock.now();
    const today = formatIso(now);
    const stmt = await this.income.get();
    const hasIncome = stmt.recurringMonthly != null || stmt.oneOffs.length > 0;
    const txs = await this.txRepo.all();

    const items = goals.map((goal) => {
      const monthsElapsed = monthsBetween(goal.createdAt, today);
      let savedSoFar: number | null = null;
      if (hasIncome) {
        const income =
          (stmt.recurringMonthly ?? 0) * monthsElapsed +
          stmt.oneOffs
            .filter((o) => o.date >= goal.createdAt && o.date <= today)
            .reduce((s, o) => s + o.amount, 0);
        const expenses = txs
          .filter((t) => t.date >= goal.createdAt && t.date <= today)
          .reduce((s, t) => s + t.amount, 0);
        savedSoFar = Math.round(income - expenses);
      }
      const remaining = goal.targetAmount - (savedSoFar ?? 0);
      const monthsToDeadline = monthsBetween(today, goal.targetDate);
      const requiredMonthlyPace =
        monthsToDeadline > 0 ? Math.round(remaining / monthsToDeadline) : remaining;
      const monthlyRate = savedSoFar != null && monthsElapsed > 0 ? savedSoFar / monthsElapsed : 0;
      const projectedCompletionDate =
        monthlyRate > 0 ? formatIso(addMonths(now, Math.ceil(remaining / monthlyRate))) : null;
      const onTrack = projectedCompletionDate != null && projectedCompletionDate <= goal.targetDate;
      return {
        goalId: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
        savedSoFar,
        remaining,
        requiredMonthlyPace,
        projectedCompletionDate,
        onTrack,
      };
    });
    return { items };
  }

  private async requireGoal(id: string): Promise<Goal> {
    const goal = await this.goalsRepo.getById(id);
    if (!goal) throw new DomainError('NOT_FOUND', `Objetivo ${id} no encontrado.`);
    return goal;
  }
}
```

- [ ] **Step 7: Create `assess-goal-risk.use-case.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { addDays, formatIso, monthsBetween } from '../../shared/domain/dates';
import { isDiscretionary } from '../../shared/domain/category';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { INCOME_REPOSITORY, type IncomeRepository } from '../../income/domain/income.repository';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

@Injectable()
export class AssessGoalRisk {
  constructor(
    @Inject(GOALS_REPOSITORY) private readonly goalsRepo: GoalsRepository,
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute() {
    const goals = await this.goalsRepo.all();
    const now = this.clock.now();
    const today = formatIso(now);
    const windowStart = addDays(today, -29);

    const stmt = await this.income.get();
    const monthlyIncome = stmt.recurringMonthly ?? 0;
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);

    let recentDiscretionarySpend = 0;
    let recentEssentialSpend = 0;
    const discretionaryTotals = new Map<string, number>();
    for (const t of txs) {
      if (t.date < windowStart || t.date > today) continue;
      const category = cats.get(t.id)!;
      if (isDiscretionary(category)) {
        recentDiscretionarySpend += t.amount;
        discretionaryTotals.set(category, (discretionaryTotals.get(category) ?? 0) + t.amount);
      } else {
        recentEssentialSpend += t.amount;
      }
    }
    const discretionaryByCategory = [...discretionaryTotals.entries()].map(([category, amount]) => ({
      category,
      amount,
    }));

    const assessments = goals.map((goal) => {
      const monthsToDeadline = monthsBetween(today, goal.targetDate);
      const requiredMonthlyPace =
        monthsToDeadline > 0 ? Math.round(goal.targetAmount / monthsToDeadline) : goal.targetAmount;
      const headroom = monthlyIncome - recentEssentialSpend - requiredMonthlyPace;

      let risk: 'none' | 'watch' | 'high';
      if (recentDiscretionarySpend <= Math.max(headroom, 0)) {
        risk = 'none';
      } else if (headroom > 0 && recentDiscretionarySpend <= headroom * 1.5) {
        risk = 'watch';
      } else {
        risk = 'high';
      }

      const overflow = recentDiscretionarySpend - Math.max(headroom, 0);
      const estimatedDelay =
        risk !== 'none' && requiredMonthlyPace > 0
          ? Math.round((overflow / requiredMonthlyPace) * 10) / 10
          : undefined;

      return {
        goalId: goal.id,
        name: goal.name,
        requiredMonthlyPace,
        recentDiscretionarySpend,
        discretionaryByCategory,
        headroom,
        risk,
        ...(estimatedDelay !== undefined ? { estimatedDelay } : {}),
      };
    });
    return { assessments };
  }
}
```

- [ ] **Step 8: Create `goals.schemas.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const setGoalInput = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkedCategory: categorySchema.optional(),
});
export const listGoalsInput = z.object({});
export const goalProgressInput = z.object({ goalId: z.string().optional() });
export const clearGoalInput = z.object({ goalId: z.string().min(1) });
export const assessRiskInput = z.object({});
```

- [ ] **Step 9: Create `goals.controller.ts`**

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { SetGoal, type SetGoalInput } from '../use-cases/set-goal.use-case';
import { ListGoals } from '../use-cases/list-goals.use-case';
import { ClearGoal, type ClearGoalInput } from '../use-cases/clear-goal.use-case';
import { GetGoalProgress, type GoalProgressInput } from '../use-cases/goal-progress.use-case';
import { AssessGoalRisk } from '../use-cases/assess-goal-risk.use-case';
import {
  assessRiskInput,
  clearGoalInput,
  goalProgressInput,
  listGoalsInput,
  setGoalInput,
} from './goals.schemas';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly setGoal: SetGoal,
    private readonly listGoals: ListGoals,
    private readonly progress: GetGoalProgress,
    private readonly clearGoal: ClearGoal,
    private readonly assessRisk: AssessGoalRisk,
  ) {}

  @Post('set')
  set(@Body(new ZodValidationPipe(setGoalInput)) body: SetGoalInput) {
    return this.setGoal.execute(body);
  }

  @Post('list')
  list(@Body(new ZodValidationPipe(listGoalsInput)) _body: Record<string, never>) {
    return this.listGoals.execute();
  }

  @Post('progress')
  getProgress(@Body(new ZodValidationPipe(goalProgressInput)) body: GoalProgressInput) {
    return this.progress.execute(body);
  }

  @Post('clear')
  clear(@Body(new ZodValidationPipe(clearGoalInput)) body: ClearGoalInput) {
    return this.clearGoal.execute(body);
  }

  @Post('assess-risk')
  assess(@Body(new ZodValidationPipe(assessRiskInput)) _body: Record<string, never>) {
    return this.assessRisk.execute();
  }
}
```

- [ ] **Step 10: Create `goals.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { IncomeModule } from '../income/income.module';
import { GOALS_REPOSITORY } from './domain/goals.repository';
import { JsonGoalsRepository } from './repositories/json-goals.repository';
import { SetGoal } from './use-cases/set-goal.use-case';
import { ListGoals } from './use-cases/list-goals.use-case';
import { ClearGoal } from './use-cases/clear-goal.use-case';
import { GetGoalProgress } from './use-cases/goal-progress.use-case';
import { AssessGoalRisk } from './use-cases/assess-goal-risk.use-case';
import { GoalsController } from './interface/goals.controller';

@Module({
  imports: [TransactionsModule, IncomeModule],
  controllers: [GoalsController],
  providers: [
    { provide: GOALS_REPOSITORY, useClass: JsonGoalsRepository },
    SetGoal,
    ListGoals,
    ClearGoal,
    GetGoalProgress,
    AssessGoalRisk,
  ],
})
export class GoalsModule {}
```

- [ ] **Step 11: Write the failing tests** — `goals.use-cases.test.ts`

```ts
import { test, expect } from 'bun:test';
import { SetGoal } from './set-goal.use-case';
import { ClearGoal } from './clear-goal.use-case';
import { AssessGoalRisk } from './assess-goal-risk.use-case';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { Goal } from '../../shared/domain/goal';
import type { GoalDraft, GoalsRepository } from '../domain/goals.repository';
import type { IncomeRepository, IncomeStatement } from '../../income/domain/income.repository';
import type { Transaction } from '../../shared/domain/transaction';

function fakeGoalsRepo(seed: Goal[] = []): GoalsRepository {
  let goals = seed.map((g) => ({ ...g }));
  return {
    async all() {
      return goals.map((g) => ({ ...g }));
    },
    async getById(id) {
      return goals.find((g) => g.id === id) ?? null;
    },
    async upsertByName(draft: GoalDraft, createdAt) {
      const i = goals.findIndex((g) => g.name.toLowerCase() === draft.name.toLowerCase());
      let goal: Goal;
      if (i >= 0) {
        goal = { ...goals[i], ...draft };
        goals[i] = goal;
      } else {
        goal = { id: `goal_${String(goals.length + 1).padStart(3, '0')}`, createdAt, ...draft };
        goals.push(goal);
      }
      return { ...goal };
    },
    async delete(id) {
      const before = goals.length;
      goals = goals.filter((g) => g.id !== id);
      return goals.length < before;
    },
  };
}

function fakeIncomeRepo(seed?: Partial<IncomeStatement>): IncomeRepository {
  const data: IncomeStatement = {
    recurringMonthly: seed?.recurringMonthly ?? null,
    oneOffs: seed?.oneOffs ? [...seed.oneOffs] : [],
  };
  return {
    async get() {
      return { recurringMonthly: data.recurringMonthly, oneOffs: [...data.oneOffs] };
    },
    async setRecurring(amount) {
      data.recurringMonthly = amount;
    },
    async addOneOff(entry) {
      data.oneOffs.push(entry);
    },
  };
}

const tx = (id: string, date: string, amount: number, category: Transaction['category']): Transaction => ({
  id,
  date,
  amount,
  currency: 'ARS',
  category,
  description: '',
  merchant: 'X',
});

test('set-goal creates a goal, then updates the same goal by name', async () => {
  const repo = fakeGoalsRepo();
  const useCase = new SetGoal(repo, fixedClock('2026-05-17'));
  const first = await useCase.execute({ name: 'Auto', targetAmount: 8_000_000, targetDate: '2026-12-31' });
  expect(first.goal.id).toBe('goal_001');
  const second = await useCase.execute({ name: 'auto', targetAmount: 9_000_000, targetDate: '2026-12-31' });
  expect(second.goal.id).toBe('goal_001');
  expect(second.goal.targetAmount).toBe(9_000_000);
  expect(await repo.all()).toHaveLength(1);
});

test('clear-goal on an unknown id throws NOT_FOUND', async () => {
  await expect(new ClearGoal(fakeGoalsRepo()).execute({ goalId: 'goal_999' })).rejects.toThrow(
    DomainError,
  );
});

test('assess-goal-risk flags high risk when discretionary spend exceeds the headroom', async () => {
  const goal: Goal = {
    id: 'goal_001',
    name: 'Auto',
    targetAmount: 1_200_000,
    targetDate: '2026-06-17',
    linkedCategory: null,
    createdAt: '2026-05-01',
  };
  const result = await new AssessGoalRisk(
    fakeGoalsRepo([goal]),
    fakeIncomeRepo({ recurringMonthly: 1_000_000 }),
    fakeTransactionsRepo([tx('txn_001', '2026-05-10', 700_000, 'entretenimiento')]),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
  ).execute();
  expect(result.assessments).toHaveLength(1);
  expect(result.assessments[0].recentDiscretionarySpend).toBe(700_000);
  expect(result.assessments[0].risk).toBe('high');
});
```

- [ ] **Step 12: Run the goals tests**

Run: `bun test apps/api/src/goals`
Expected: PASS — 3 tests.

- [ ] **Step 13: Type-check & commit**

Run: `bun run build --filter=api` → exit 0.

```bash
git add apps/api/src/goals
git commit -m "feat(api): savings-goal coaching feature"
```

---

## Task 15: App wiring & final verification

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Replace `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { SharedModule } from './shared/shared.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategorizationModule } from './categorization/categorization.module';
import { SpendingModule } from './spending/spending.module';
import { InsightsModule } from './insights/insights.module';
import { BudgetsModule } from './budgets/budgets.module';
import { IncomeModule } from './income/income.module';
import { GoalsModule } from './goals/goals.module';

@Module({
  imports: [
    SharedModule,
    TransactionsModule,
    CategorizationModule,
    SpendingModule,
    InsightsModule,
    BudgetsModule,
    IncomeModule,
    GoalsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 2: Replace `main.ts`** — enable CORS (for the agent / UI) and register the global error filter.

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './shared/interface/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalFilters(new DomainExceptionFilter());
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`api listening on http://localhost:${port}`);
}

bootstrap();
```

- [ ] **Step 3: Type-check the whole app**

Run: `bun run build --filter=api`
Expected: exit 0, no output.

- [ ] **Step 4: Run the full test suite**

Run: `bun test --filter=api` (from the repo root) or `cd apps/api && bun test`
Expected: PASS — all suites green (≈ 36 tests across 14 files).

- [ ] **Step 5: Manual endpoint walkthrough**

Start the API: `bun dev --filter=api` (listens on `http://localhost:3001`). In another shell, run:

```bash
curl -s localhost:3001/health
# → {"ok":true}

curl -s -X POST localhost:3001/spending/sum-by-category \
  -H 'content-type: application/json' -H 'x-user-id: default-user' \
  -d '{"category":"comida","period":{"kind":"calendarMonth","month":"2026-05"}}'
# → {"category":"comida","total":<n>,"transactionCount":<n>}

curl -s -X POST localhost:3001/spending/breakdown \
  -H 'content-type: application/json' \
  -d '{"period":{"kind":"calendarMonth","month":"2026-05"}}'
# → {"total":<n>,"breakdown":[...]}

curl -s -X POST localhost:3001/insights/project-month-end \
  -H 'content-type: application/json' -d '{}'
# → {"daysElapsed":...,"daysInMonth":...,"spentSoFar":...,"projectedTotal":...,"caveat":...}

curl -s -X POST localhost:3001/budgets/set \
  -H 'content-type: application/json' -d '{"category":"comida","amount":50000}'
curl -s -X POST localhost:3001/budgets/progress \
  -H 'content-type: application/json' -d '{}'
# → {"items":[{"category":"comida","budget":50000,...,"pace":"under|on|over"}]}

curl -s -X POST localhost:3001/income/declare \
  -H 'content-type: application/json' -d '{"kind":"recurring","amount":1500000}'
curl -s -X POST localhost:3001/income/cash-flow \
  -H 'content-type: application/json' \
  -d '{"period":{"kind":"calendarMonth","month":"2026-05"}}'
# → {"income":...,"expenses":...,"net":...,"savingsRate":...}

curl -s -X POST localhost:3001/categorization/merchant \
  -H 'content-type: application/json' -d '{"merchant":"Coderhouse","category":"educacion"}'

curl -s -X POST localhost:3001/transactions/add \
  -H 'content-type: application/json' \
  -d '{"amount":3000,"description":"Cafe","merchant":"Starbucks","category":"comida"}'
# → {"transaction":{"id":"txn_0NN",...}}
# then update / delete it with the returned id:
curl -s -X POST localhost:3001/transactions/update \
  -H 'content-type: application/json' \
  -d '{"transactionId":"txn_0NN","fields":{"amount":3500}}'
curl -s -X POST localhost:3001/transactions/delete \
  -H 'content-type: application/json' -d '{"transactionId":"txn_0NN"}'

curl -s -X POST localhost:3001/goals/set \
  -H 'content-type: application/json' \
  -d '{"name":"Auto","targetAmount":8000000,"targetDate":"2026-12-31"}'
curl -s -X POST localhost:3001/goals/progress -H 'content-type: application/json' -d '{}'
curl -s -X POST localhost:3001/goals/assess-risk -H 'content-type: application/json' -d '{}'
```

Then confirm the error envelope:

```bash
curl -s -X POST localhost:3001/transactions/delete \
  -H 'content-type: application/json' -d '{"transactionId":"txn_does_not_exist"}'
# → {"error":{"code":"NOT_FOUND","message":"Transacción txn_does_not_exist no encontrada."}}

curl -s -X POST localhost:3001/budgets/set \
  -H 'content-type: application/json' -d '{"category":"comida"}'
# → {"error":{"code":"VALIDATION_ERROR","message":"amount: ..."}}
```

- [ ] **Step 6: Persistence check**

Stop and restart `bun dev --filter=api`. Re-run `curl -X POST localhost:3001/budgets/progress -d '{}'` — the budget set in Step 5 is still there. Confirm `apps/api/data/budgets.json`, `income.json`, `goals.json`, `category-overrides.json` exist and `git status` shows them ignored.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(api): wire feature modules, CORS and global error filter"
```

---

## Self-review notes

- **24 endpoints** — all present: transactions (4, Task 8), categorization (2, Task 9), spending (5, Task 10), insights (3, Task 11), budgets (3, Task 12), income (2, Task 13), goals (5, Task 14) = 24, 1:1 with the agent contract.
- **Override resolution** — `CategoryResolver` (Task 7) applies tx → merchant → seed; every aggregation use-case calls `resolveAll`; verified by the spending override test.
- **Dynamic dates** — every "today" flows through the injected `Clock`; `PeriodResolver` and all algorithm use-cases take it; tests use `fixedClock`.
- **Persistence** — transactions rewrite `data/transactions.json`; budgets/income/goals/overrides under `apps/api/data/` via `JsonStore`; restart check in Task 15 Step 6.
- **Error envelope** — `DomainExceptionFilter` (Task 5), registered globally in Task 15.
- **Graceful, non-error outcomes** — `getCashFlow`/`getGoalProgress` return `null` rather than erroring; `proposeTransactionMutation` returns a `matches` array (0..n) and never throws.
- **Tests** — `bun:test`, in-memory fakes, use-case + algorithm coverage; no controller/HTTP/agent tests.

