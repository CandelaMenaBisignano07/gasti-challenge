# Custom Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user create, rename, delete, and assign their own spending categories through conversation, first-class alongside the seven fixed defaults.

**Architecture:** A category registry — the seven defaults are built-in constants; custom categories are user-defined slugs persisted in a sidecar `custom-categories.json`. The `categorySchema` Zod enum is widened to an open string (keeping the export name, so no import site changes); validity becomes a runtime `CategoryRegistry` check inside use-cases. Custom-category management (create/rename/delete/list) is **folded into the existing `categorization/` feature** in both apps — new use-cases, controller routes, gateway methods, and tools extend the files already there. Rename/delete cascade across transactions, categorization overrides, and budgets.

**Tech Stack:** TypeScript, NestJS 10 (apps/api), Mastra (apps/ai), Next.js/React (apps/ui), Zod, bun:test.

---

## File Structure

**apps/api — new files (inside the existing `categorization/` feature):**
- `src/categorization/repositories/json-categories.repository.ts` — JSON registry sidecar.
- `src/categorization/providers/category-name.ts` — pure name normalizer.
- `src/categorization/use-cases/create-category.use-case.ts`
- `src/categorization/use-cases/rename-category.use-case.ts`
- `src/categorization/use-cases/delete-category.use-case.ts`
- `src/categorization/use-cases/list-categories.use-case.ts`
- `src/categorization/providers/category-name.test.ts`
- `src/categorization/use-cases/category-management.use-cases.test.ts`
- `src/shared/domain/custom-categories.ts` — registry repository contract.
- `src/shared/providers/category-registry.ts` — registry provider.

**apps/api — modified:**
- `src/shared/domain/category.ts` — enum → open string, add `DEFAULT_CATEGORIES`.
- `src/shared/domain/category-overrides.ts` — add `reassignCategory` to the interface.
- `src/shared/shared.module.ts` — register the categories repository + registry.
- `src/shared/testing/fakes.ts` — add `reassignCategory` to fakes, add `fakeBudgetsRepo` + `fakeCategoriesRepo`.
- `src/categorization/interface/categorization.schemas.ts` — add category-management schemas.
- `src/categorization/interface/categorization.controller.ts` — add category-management routes.
- `src/categorization/categorization.module.ts` — register the new use-cases, import `BudgetsModule`.
- `src/categorization/repositories/json-categorization.repository.ts` — implement `reassignCategory`.
- `src/transactions/domain/transactions.repository.ts` + `repositories/json-transactions.repository.ts` — add `reassignCategory`.
- `src/budgets/domain/budgets.repository.ts` + `repositories/json-budgets.repository.ts` + `budgets.module.ts` — add `reassignCategory`/`clearCategory`, export the token.
- Registry validation added to `AddTransaction`, `UpdateTransaction`, `OverrideMerchantCategory`, `OverrideTransactionCategory`, `SetBudget`, `SumByCategory`.
- Tests for the above use-cases updated for the new constructor argument.

**apps/ai — modified (inside the existing `categorization/` feature):**
- `src/shared/domain/category.ts` — enum → open string, add `DEFAULT_CATEGORIES`.
- `src/categorization/domain/categorization.gateway.ts` — add category-management schemas + gateway methods.
- `src/categorization/providers/http-categorization.gateway.ts` — add the new routes.
- `src/categorization/interface/categorization.tools.ts` — add the four category tools.
- `src/mastra/index.ts` — fetch the live category list per request.
- `src/agent/gasti-agent.ts` — extend `requestContextSchema`.
- `src/agent/instructions.ts` — rewrite the CATEGORIES block with the live list.

**apps/ui:** no change — `CategoryIcon` already falls back to a generic `Tag` icon for unknown category names.

---

## Task 1: Widen the api category schema

**Files:**
- Modify: `apps/api/src/shared/domain/category.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { z } from 'zod';

/** The seven built-in categories. Custom categories are added on top at runtime. */
export const DEFAULT_CATEGORIES = [
  'comida',
  'transporte',
  'entretenimiento',
  'salud',
  'servicios',
  'educacion',
  'otros',
] as const;

/**
 * A category name. This schema only checks shape (a non-empty string).
 * Whether the name is a *known* category (default or custom) is a runtime
 * check done by `CategoryRegistry` inside use-cases.
 */
export const categorySchema = z.string().min(1);

export type Category = z.infer<typeof categorySchema>;

export const DISCRETIONARY_CATEGORIES: readonly string[] = ['entretenimiento', 'otros'];

export function isDiscretionary(category: string): boolean {
  return DISCRETIONARY_CATEGORIES.includes(category);
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds. (Every `import { categorySchema }` site keeps working — the name is unchanged.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/domain/category.ts
git commit -m "feat: widen category schema to an open string"
```

---

## Task 2: Widen the ai category schema

**Files:**
- Modify: `apps/ai/src/shared/domain/category.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { z } from 'zod';

/** The seven built-in categories. Custom categories are added on top at runtime. */
export const DEFAULT_CATEGORIES = [
  'comida',
  'transporte',
  'entretenimiento',
  'salud',
  'servicios',
  'educacion',
  'otros',
] as const;

/** A category name. Validity against the registry is checked server-side. */
export const categorySchema = z.string().min(1);

export type Category = z.infer<typeof categorySchema>;
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/shared/domain/category.ts
git commit -m "feat: widen ai category schema to an open string"
```

---

## Task 3: Categories registry contract

**Files:**
- Create: `apps/api/src/shared/domain/custom-categories.ts`

- [ ] **Step 1: Write the contract**

This lives in `shared/domain` (not the feature folder) so `CategoryRegistry` — also in `shared` — depends only on a shared contract, exactly as `CategorizationRepository` lives in `shared/domain/category-overrides.ts`.

```typescript
export const CATEGORIES_REPOSITORY = 'CATEGORIES_REPOSITORY';

/** The user-created category slugs. The seven defaults are NOT stored here. */
export type CustomCategories = string[];

export const EMPTY_CUSTOM_CATEGORIES: CustomCategories = [];

export interface CategoriesRepository {
  all(): Promise<CustomCategories>;
  add(name: string): Promise<void>;
  remove(name: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/domain/custom-categories.ts
git commit -m "feat: add custom categories registry contract"
```

---

## Task 4: JSON categories registry repository

**Files:**
- Create: `apps/api/src/categorization/repositories/json-categories.repository.ts`

- [ ] **Step 1: Write the repository**

```typescript
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import {
  EMPTY_CUSTOM_CATEGORIES,
  type CategoriesRepository,
  type CustomCategories,
} from '../../shared/domain/custom-categories';

@Injectable()
export class JsonCategoriesRepository implements CategoriesRepository {
  private readonly store: JsonStore<CustomCategories> = createJsonStore<CustomCategories>(
    path.join(DATA_DIR, 'custom-categories.json'),
    EMPTY_CUSTOM_CATEGORIES,
  );

  all(): Promise<CustomCategories> {
    return this.store.read();
  }

  async add(name: string): Promise<void> {
    const data = await this.store.read();
    if (!data.includes(name)) data.push(name);
    await this.store.write(data);
  }

  async remove(name: string): Promise<void> {
    const data = await this.store.read();
    await this.store.write(data.filter((c) => c !== name));
  }

  async rename(from: string, to: string): Promise<void> {
    const data = await this.store.read();
    await this.store.write(data.map((c) => (c === from ? to : c)));
  }
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/categorization/repositories/json-categories.repository.ts
git commit -m "feat: add JSON-backed categories registry repository"
```

---

## Task 5: Add `reassignCategory` to the transactions repository

**Files:**
- Modify: `apps/api/src/transactions/domain/transactions.repository.ts`
- Modify: `apps/api/src/transactions/repositories/json-transactions.repository.ts`
- Modify: `apps/api/src/shared/testing/fakes.ts`

- [ ] **Step 1: Add the method to the interface**

In `apps/api/src/transactions/domain/transactions.repository.ts`, add this line to the `TransactionsRepository` interface, after `nextId()`:

```typescript
  /** Rewrite the base category of every transaction whose category is `from`. */
  reassignCategory(from: string, to: string): Promise<void>;
```

- [ ] **Step 2: Implement it in the JSON repository**

In `apps/api/src/transactions/repositories/json-transactions.repository.ts`, add this method after `nextId()`:

```typescript
  async reassignCategory(from: string, to: string): Promise<void> {
    const txs = await this.store.read();
    let changed = false;
    for (const t of txs) {
      if (t.category === from) {
        t.category = to;
        changed = true;
      }
    }
    if (changed) await this.store.write(txs);
  }
```

- [ ] **Step 3: Implement it in the fake**

In `apps/api/src/shared/testing/fakes.ts`, inside `fakeTransactionsRepo`, add this method after `nextId`:

```typescript
    async reassignCategory(from, to) {
      for (const t of txs) if (t.category === from) t.category = to;
    },
```

- [ ] **Step 4: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions/domain/transactions.repository.ts apps/api/src/transactions/repositories/json-transactions.repository.ts apps/api/src/shared/testing/fakes.ts
git commit -m "feat: add reassignCategory to transactions repository"
```

---

## Task 6: Add `reassignCategory` to the categorization repository

**Files:**
- Modify: `apps/api/src/shared/domain/category-overrides.ts`
- Modify: `apps/api/src/categorization/repositories/json-categorization.repository.ts`
- Modify: `apps/api/src/shared/testing/fakes.ts`

- [ ] **Step 1: Add the method to the interface**

In `apps/api/src/shared/domain/category-overrides.ts`, add this line to the `CategorizationRepository` interface, after `setTransaction(...)`:

```typescript
  /** Rewrite every merchant/transaction override whose value is `from` to `to`. */
  reassignCategory(from: Category, to: Category): Promise<void>;
```

- [ ] **Step 2: Implement it in the JSON repository**

In `apps/api/src/categorization/repositories/json-categorization.repository.ts`, add this method after `setTransaction(...)`:

```typescript
  async reassignCategory(from: Category, to: Category): Promise<void> {
    const data = await this.store.read();
    for (const m of Object.keys(data.merchants)) {
      if (data.merchants[m] === from) data.merchants[m] = to;
    }
    for (const id of Object.keys(data.transactions)) {
      if (data.transactions[id] === from) data.transactions[id] = to;
    }
    await this.store.write(data);
  }
```

- [ ] **Step 3: Implement it in the fake**

In `apps/api/src/shared/testing/fakes.ts`, inside `fakeCategorizationRepo`, add this method after `setTransaction`:

```typescript
    async reassignCategory(from: Category, to: Category) {
      for (const m of Object.keys(data.merchants)) {
        if (data.merchants[m] === from) data.merchants[m] = to;
      }
      for (const id of Object.keys(data.transactions)) {
        if (data.transactions[id] === from) data.transactions[id] = to;
      }
    },
```

- [ ] **Step 4: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/domain/category-overrides.ts apps/api/src/categorization/repositories/json-categorization.repository.ts apps/api/src/shared/testing/fakes.ts
git commit -m "feat: add reassignCategory to categorization repository"
```

---

## Task 7: Add cascade methods to the budgets repository

**Files:**
- Modify: `apps/api/src/budgets/domain/budgets.repository.ts`
- Modify: `apps/api/src/budgets/repositories/json-budgets.repository.ts`
- Modify: `apps/api/src/shared/testing/fakes.ts`
- Modify: `apps/api/src/budgets/use-cases/budgets.use-cases.test.ts`

- [ ] **Step 1: Add the methods to the interface**

In `apps/api/src/budgets/domain/budgets.repository.ts`, add these two lines to the `BudgetsRepository` interface, after `clear(...)`:

```typescript
  /** Move the budget under `from` to `to`, in every month it appears. */
  reassignCategory(from: string, to: string): Promise<void>;
  /** Remove the budget under `category`, in every month. */
  clearCategory(category: string): Promise<void>;
```

- [ ] **Step 2: Implement them in the JSON repository**

In `apps/api/src/budgets/repositories/json-budgets.repository.ts`, add these methods after `clear(...)`:

```typescript
  async reassignCategory(from: string, to: string): Promise<void> {
    const data = await this.store.read();
    for (const month of Object.keys(data)) {
      if (data[month][from] !== undefined) {
        data[month][to] = data[month][from];
        delete data[month][from];
      }
    }
    await this.store.write(data);
  }

  async clearCategory(category: string): Promise<void> {
    const data = await this.store.read();
    for (const month of Object.keys(data)) delete data[month][category];
    await this.store.write(data);
  }
```

- [ ] **Step 3: Add a shared `fakeBudgetsRepo` to `fakes.ts`**

In `apps/api/src/shared/testing/fakes.ts`, add this import near the other type imports at the top:

```typescript
import type { BudgetsRepository } from '../../budgets/domain/budgets.repository';
```

Append this function to the end of `fakes.ts`:

```typescript
export function fakeBudgetsRepo(
  seed: Record<string, Record<string, number>> = {},
): BudgetsRepository {
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
    async reassignCategory(from, to) {
      for (const month of Object.keys(data)) {
        if (data[month][from] !== undefined) {
          data[month][to] = data[month][from];
          delete data[month][from];
        }
      }
    },
    async clearCategory(category) {
      for (const month of Object.keys(data)) delete data[month][category];
    },
  };
}
```

- [ ] **Step 4: Switch the budgets test to the shared fake**

In `apps/api/src/budgets/use-cases/budgets.use-cases.test.ts`, delete the local `fakeBudgetsRepo` function definition and the now-unused `BudgetsRepository` import. Update the `fakes` import line to include `fakeBudgetsRepo`:

```typescript
import {
  fakeBudgetsRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
  fixedClock,
} from '../../shared/testing/fakes';
```

(The `import type { Category }` line in that test stays — it is still referenced by the test's `tx` helper.)

- [ ] **Step 5: Verify the build and the budgets test**

Run: `cd apps/api && bun run build && bun test src/budgets/use-cases/budgets.use-cases.test.ts`
Expected: build succeeds; both budgets tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/budgets/domain/budgets.repository.ts apps/api/src/budgets/repositories/json-budgets.repository.ts apps/api/src/shared/testing/fakes.ts apps/api/src/budgets/use-cases/budgets.use-cases.test.ts
git commit -m "feat: add budget category cascade methods"
```

---

## Task 8: Fake categories repository

**Files:**
- Modify: `apps/api/src/shared/testing/fakes.ts`

- [ ] **Step 1: Append the fake to `fakes.ts`**

Add this import near the other type imports at the top:

```typescript
import type { CategoriesRepository } from '../domain/custom-categories';
```

Append this function to the end of `fakes.ts`:

```typescript
export function fakeCategoriesRepo(seed: string[] = []): CategoriesRepository {
  let data = [...seed];
  return {
    async all() {
      return [...data];
    },
    async add(name) {
      if (!data.includes(name)) data.push(name);
    },
    async remove(name) {
      data = data.filter((c) => c !== name);
    },
    async rename(from, to) {
      data = data.map((c) => (c === from ? to : c));
    },
  };
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/testing/fakes.ts
git commit -m "feat: add fake categories repository for tests"
```

---

## Task 9: CategoryRegistry provider

**Files:**
- Create: `apps/api/src/shared/providers/category-registry.ts`

- [ ] **Step 1: Write the provider**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORIES } from '../domain/category';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../domain/custom-categories';

/** Resolves the live set of valid categories: the seven defaults + custom ones. */
@Injectable()
export class CategoryRegistry {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
  ) {}

  /** Defaults first, then custom categories. */
  async all(): Promise<string[]> {
    return [...DEFAULT_CATEGORIES, ...(await this.repo.all())];
  }

  async exists(name: string): Promise<boolean> {
    return (await this.all()).includes(name);
  }

  isDefault(name: string): boolean {
    return (DEFAULT_CATEGORIES as readonly string[]).includes(name);
  }

  async isCustom(name: string): Promise<boolean> {
    return (await this.repo.all()).includes(name);
  }
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/providers/category-registry.ts
git commit -m "feat: add category registry provider"
```

---

## Task 10: Category name normalizer (TDD)

**Files:**
- Create: `apps/api/src/categorization/providers/category-name.ts`
- Test: `apps/api/src/categorization/providers/category-name.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/categorization/providers/category-name.test.ts`:

```typescript
import { test, expect } from 'bun:test';
import { normalizeCategoryName } from './category-name';

test('normalizeCategoryName trims, lowercases and collapses whitespace', () => {
  expect(normalizeCategoryName('  Mascotas  ')).toBe('mascotas');
  expect(normalizeCategoryName('Gastos   Fijos')).toBe('gastos fijos');
});

test('normalizeCategoryName returns an empty string for blank input', () => {
  expect(normalizeCategoryName('   ')).toBe('');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test src/categorization/providers/category-name.test.ts`
Expected: FAIL — cannot find module `./category-name`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/categorization/providers/category-name.ts`:

```typescript
/** Normalizes a category name to its stored slug: trim, collapse whitespace, lowercase. */
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test src/categorization/providers/category-name.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/categorization/providers/category-name.ts apps/api/src/categorization/providers/category-name.test.ts
git commit -m "feat: add category name normalizer"
```

---

## Task 11: CreateCategory use-case (TDD)

**Files:**
- Create: `apps/api/src/categorization/use-cases/create-category.use-case.ts`
- Test: `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts`:

```typescript
import { test, expect } from 'bun:test';
import { CreateCategory } from './create-category.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo } from '../../shared/testing/fakes';

test('create-category normalizes the name and persists it', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  const result = await useCase.execute({ name: '  Mascotas ' });
  expect(result).toEqual({ name: 'mascotas' });
  expect(await repo.all()).toEqual(['mascotas']);
});

test('create-category rejects a name that collides with a default', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await expect(useCase.execute({ name: 'Comida' })).rejects.toThrow(DomainError);
});

test('create-category rejects a name that collides with an existing custom category', async () => {
  const repo = fakeCategoriesRepo(['mascotas']);
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await expect(useCase.execute({ name: 'mascotas' })).rejects.toThrow(DomainError);
});

test('create-category rejects a blank or over-long name', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await expect(useCase.execute({ name: '   ' })).rejects.toThrow(DomainError);
  await expect(useCase.execute({ name: 'x'.repeat(25) })).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: FAIL — cannot find module `./create-category.use-case`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/categorization/use-cases/create-category.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import { normalizeCategoryName } from '../providers/category-name';

export interface CreateCategoryInput {
  name: string;
}

export interface CreateCategoryResult {
  name: string;
}

@Injectable()
export class CreateCategory {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: CreateCategoryInput): Promise<CreateCategoryResult> {
    const name = normalizeCategoryName(input.name);
    if (name.length === 0 || name.length > 24) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'El nombre de la categoría debe tener entre 1 y 24 caracteres.',
      );
    }
    if (await this.registry.exists(name)) {
      throw new DomainError('VALIDATION_ERROR', `La categoría "${name}" ya existe.`);
    }
    await this.repo.add(name);
    return { name };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/categorization/use-cases/create-category.use-case.ts apps/api/src/categorization/use-cases/category-management.use-cases.test.ts
git commit -m "feat: add create-category use-case"
```

---

## Task 12: RenameCategory use-case (TDD)

**Files:**
- Create: `apps/api/src/categorization/use-cases/rename-category.use-case.ts`
- Test: `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Add these imports at the top of `category-management.use-cases.test.ts`, next to the existing imports:

```typescript
import { RenameCategory } from './rename-category.use-case';
import {
  fakeBudgetsRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
} from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const tx = (id: string, category: string): Transaction => ({
  id,
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category,
  description: '',
  merchant: 'Coto',
});
```

Append these tests at the end of the file:

```typescript
test('rename-category cascades into transactions, overrides and budgets', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const txs = fakeTransactionsRepo([tx('txn_001', 'mascotas'), tx('txn_002', 'comida')]);
  const overrides = fakeCategorizationRepo({
    merchants: { 'Pet Shop': 'mascotas' },
    transactions: { txn_003: 'mascotas' },
  });
  const budgets = fakeBudgetsRepo({ '2026-05': { mascotas: 10000 } });
  const useCase = new RenameCategory(categories, txs, overrides, budgets, new CategoryRegistry(categories));

  const result = await useCase.execute({ from: 'mascotas', to: 'Animales' });

  expect(result).toEqual({ from: 'mascotas', to: 'animales' });
  expect(await categories.all()).toEqual(['animales']);
  expect((await txs.all()).find((t) => t.id === 'txn_001')?.category).toBe('animales');
  expect((await overrides.overrides()).merchants['Pet Shop']).toBe('animales');
  expect((await overrides.overrides()).transactions.txn_003).toBe('animales');
  expect(await budgets.forMonth('2026-05')).toEqual({ animales: 10000 });
});

test('rename-category rejects renaming a default category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new RenameCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ from: 'comida', to: 'comidas' })).rejects.toThrow(DomainError);
});

test('rename-category rejects an unknown source category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new RenameCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ from: 'inexistente', to: 'algo' })).rejects.toThrow(DomainError);
});

test('rename-category rejects a target that collides with an existing category', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const useCase = new RenameCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ from: 'mascotas', to: 'Comida' })).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: FAIL — cannot find module `./rename-category.use-case`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/categorization/use-cases/rename-category.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../../shared/domain/category-overrides';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../../budgets/domain/budgets.repository';
import { normalizeCategoryName } from '../providers/category-name';

export interface RenameCategoryInput {
  from: string;
  to: string;
}

export interface RenameCategoryResult {
  from: string;
  to: string;
}

@Injectable()
export class RenameCategory {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    @Inject(CATEGORIZATION_REPOSITORY) private readonly catRepo: CategorizationRepository,
    @Inject(BUDGETS_REPOSITORY) private readonly budgetsRepo: BudgetsRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: RenameCategoryInput): Promise<RenameCategoryResult> {
    const from = normalizeCategoryName(input.from);
    const to = normalizeCategoryName(input.to);
    if (to.length === 0 || to.length > 24) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'El nombre de la categoría debe tener entre 1 y 24 caracteres.',
      );
    }
    if (this.registry.isDefault(from)) {
      throw new DomainError('VALIDATION_ERROR', `"${from}" es una categoría por defecto y no se puede renombrar.`);
    }
    if (!(await this.registry.isCustom(from))) {
      throw new DomainError('NOT_FOUND', `La categoría "${from}" no existe.`);
    }
    if (await this.registry.exists(to)) {
      throw new DomainError('VALIDATION_ERROR', `La categoría "${to}" ya existe.`);
    }
    await this.txRepo.reassignCategory(from, to);
    await this.catRepo.reassignCategory(from, to);
    await this.budgetsRepo.reassignCategory(from, to);
    await this.repo.rename(from, to);
    return { from, to };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/categorization/use-cases/rename-category.use-case.ts apps/api/src/categorization/use-cases/category-management.use-cases.test.ts
git commit -m "feat: add rename-category use-case"
```

---

## Task 13: DeleteCategory use-case (TDD)

**Files:**
- Create: `apps/api/src/categorization/use-cases/delete-category.use-case.ts`
- Test: `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Add this import at the top of `category-management.use-cases.test.ts`, next to the other use-case imports:

```typescript
import { DeleteCategory } from './delete-category.use-case';
```

Append these tests at the end of the file:

```typescript
test('delete-category falls everything back to otros and removes the category', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const txs = fakeTransactionsRepo([tx('txn_001', 'mascotas'), tx('txn_002', 'comida')]);
  const overrides = fakeCategorizationRepo({
    merchants: { 'Pet Shop': 'mascotas' },
    transactions: { txn_003: 'mascotas' },
  });
  const budgets = fakeBudgetsRepo({ '2026-05': { mascotas: 10000, comida: 50000 } });
  const useCase = new DeleteCategory(categories, txs, overrides, budgets, new CategoryRegistry(categories));

  const result = await useCase.execute({ name: 'Mascotas' });

  expect(result).toEqual({ name: 'mascotas' });
  expect(await categories.all()).toEqual([]);
  expect((await txs.all()).find((t) => t.id === 'txn_001')?.category).toBe('otros');
  expect((await overrides.overrides()).merchants['Pet Shop']).toBe('otros');
  expect((await overrides.overrides()).transactions.txn_003).toBe('otros');
  expect(await budgets.forMonth('2026-05')).toEqual({ comida: 50000 });
});

test('delete-category rejects deleting a default category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new DeleteCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ name: 'comida' })).rejects.toThrow(DomainError);
});

test('delete-category rejects an unknown category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new DeleteCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ name: 'inexistente' })).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: FAIL — cannot find module `./delete-category.use-case`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/categorization/use-cases/delete-category.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../../shared/domain/category-overrides';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../../budgets/domain/budgets.repository';
import { normalizeCategoryName } from '../providers/category-name';

const FALLBACK_CATEGORY = 'otros';

export interface DeleteCategoryInput {
  name: string;
}

export interface DeleteCategoryResult {
  name: string;
}

@Injectable()
export class DeleteCategory {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    @Inject(CATEGORIZATION_REPOSITORY) private readonly catRepo: CategorizationRepository,
    @Inject(BUDGETS_REPOSITORY) private readonly budgetsRepo: BudgetsRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: DeleteCategoryInput): Promise<DeleteCategoryResult> {
    const name = normalizeCategoryName(input.name);
    if (this.registry.isDefault(name)) {
      throw new DomainError('VALIDATION_ERROR', `"${name}" es una categoría por defecto y no se puede borrar.`);
    }
    if (!(await this.registry.isCustom(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    await this.txRepo.reassignCategory(name, FALLBACK_CATEGORY);
    await this.catRepo.reassignCategory(name, FALLBACK_CATEGORY);
    await this.budgetsRepo.clearCategory(name);
    await this.repo.remove(name);
    return { name };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: PASS — 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/categorization/use-cases/delete-category.use-case.ts apps/api/src/categorization/use-cases/category-management.use-cases.test.ts
git commit -m "feat: add delete-category use-case"
```

---

## Task 14: ListCategories use-case (TDD)

**Files:**
- Create: `apps/api/src/categorization/use-cases/list-categories.use-case.ts`
- Test: `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Add this import at the top of `category-management.use-cases.test.ts`, next to the other use-case imports:

```typescript
import { ListCategories } from './list-categories.use-case';
```

Append this test at the end of the file:

```typescript
test('list-categories returns defaults then custom, flagged by isCustom', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const result = await new ListCategories(categories, new CategoryRegistry(categories)).execute();
  expect(result.categories).toEqual([
    { name: 'comida', isCustom: false },
    { name: 'transporte', isCustom: false },
    { name: 'entretenimiento', isCustom: false },
    { name: 'salud', isCustom: false },
    { name: 'servicios', isCustom: false },
    { name: 'educacion', isCustom: false },
    { name: 'otros', isCustom: false },
    { name: 'mascotas', isCustom: true },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: FAIL — cannot find module `./list-categories.use-case`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/categorization/use-cases/list-categories.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';

export interface CategoryListing {
  name: string;
  isCustom: boolean;
}

export interface ListCategoriesResult {
  categories: CategoryListing[];
}

@Injectable()
export class ListCategories {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(): Promise<ListCategoriesResult> {
    const custom = new Set(await this.repo.all());
    const all = await this.registry.all();
    return { categories: all.map((name) => ({ name, isCustom: custom.has(name) })) };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts`
Expected: PASS — 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/categorization/use-cases/list-categories.use-case.ts apps/api/src/categorization/use-cases/category-management.use-cases.test.ts
git commit -m "feat: add list-categories use-case"
```

---

## Task 15: Extend the categorization schemas and controller

**Files:**
- Modify: `apps/api/src/categorization/interface/categorization.schemas.ts`
- Modify: `apps/api/src/categorization/interface/categorization.controller.ts`

- [ ] **Step 1: Add the category-management schemas**

Append to `apps/api/src/categorization/interface/categorization.schemas.ts`:

```typescript
export const createCategoryInput = z.object({
  name: z.string().min(1).max(24),
});

export const renameCategoryInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1).max(24),
});

export const deleteCategoryInput = z.object({
  name: z.string().min(1),
});
```

- [ ] **Step 2: Replace the controller with the extended version**

Replace the contents of `apps/api/src/categorization/interface/categorization.controller.ts` with:

```typescript
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
import { CreateCategory, type CreateCategoryInput } from '../use-cases/create-category.use-case';
import { RenameCategory, type RenameCategoryInput } from '../use-cases/rename-category.use-case';
import { DeleteCategory, type DeleteCategoryInput } from '../use-cases/delete-category.use-case';
import { ListCategories } from '../use-cases/list-categories.use-case';
import {
  createCategoryInput,
  deleteCategoryInput,
  overrideMerchantInput,
  overrideTransactionInput,
  renameCategoryInput,
} from './categorization.schemas';

@Controller('categorization')
export class CategorizationController {
  constructor(
    private readonly merchant: OverrideMerchantCategory,
    private readonly transaction: OverrideTransactionCategory,
    private readonly create: CreateCategory,
    private readonly rename: RenameCategory,
    private readonly del: DeleteCategory,
    private readonly list: ListCategories,
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

  @Post('create-category')
  createCategory(@Body(new ZodValidationPipe(createCategoryInput)) body: CreateCategoryInput) {
    return this.create.execute(body);
  }

  @Post('rename-category')
  renameCategory(@Body(new ZodValidationPipe(renameCategoryInput)) body: RenameCategoryInput) {
    return this.rename.execute(body);
  }

  @Post('delete-category')
  deleteCategory(@Body(new ZodValidationPipe(deleteCategoryInput)) body: DeleteCategoryInput) {
    return this.del.execute(body);
  }

  @Post('list-categories')
  listCategories() {
    return this.list.execute();
  }
}
```

- [ ] **Step 3: Verify the build still compiles**

Run: `cd apps/api && bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/categorization/interface/categorization.schemas.ts apps/api/src/categorization/interface/categorization.controller.ts
git commit -m "feat: add category-management routes to the categorization controller"
```

---

## Task 16: Wire the new use-cases and registry into the api

**Files:**
- Modify: `apps/api/src/shared/shared.module.ts`
- Modify: `apps/api/src/budgets/budgets.module.ts`
- Modify: `apps/api/src/categorization/categorization.module.ts`

- [ ] **Step 1: Register the categories repository and registry in `SharedModule`**

`CATEGORIES_REPOSITORY` and `CategoryRegistry` must be global — `CategoryRegistry` is injected by use-cases across many features, mirroring how `CATEGORIZATION_REPOSITORY` and `CategoryResolver` are already global. Replace `apps/api/src/shared/shared.module.ts` with:

```typescript
import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './providers/clock';
import { PeriodResolver } from './providers/period-resolver';
import { CategoryResolver } from './providers/category-resolver';
import { CategoryRegistry } from './providers/category-registry';
import { CATEGORIZATION_REPOSITORY } from './domain/category-overrides';
import { CATEGORIES_REPOSITORY } from './domain/custom-categories';
import { JsonCategorizationRepository } from '../categorization/repositories/json-categorization.repository';
import { JsonCategoriesRepository } from '../categorization/repositories/json-categories.repository';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    PeriodResolver,
    CategoryResolver,
    CategoryRegistry,
    { provide: CATEGORIZATION_REPOSITORY, useClass: JsonCategorizationRepository },
    { provide: CATEGORIES_REPOSITORY, useClass: JsonCategoriesRepository },
  ],
  exports: [
    CLOCK,
    PeriodResolver,
    CategoryResolver,
    CategoryRegistry,
    CATEGORIZATION_REPOSITORY,
    CATEGORIES_REPOSITORY,
  ],
})
export class SharedModule {}
```

- [ ] **Step 2: Export `BUDGETS_REPOSITORY` from `BudgetsModule`**

`RenameCategory` / `DeleteCategory` inject `BUDGETS_REPOSITORY` for the cascade. In `apps/api/src/budgets/budgets.module.ts`, add an `exports` array — replace the `@Module({...})` block with:

```typescript
@Module({
  imports: [TransactionsModule],
  controllers: [BudgetsController],
  providers: [
    { provide: BUDGETS_REPOSITORY, useClass: JsonBudgetsRepository },
    SetBudget,
    ClearBudget,
    GetBudgetProgress,
  ],
  exports: [BUDGETS_REPOSITORY],
})
export class BudgetsModule {}
```

- [ ] **Step 3: Register the new use-cases in `CategorizationModule`**

Replace the contents of `apps/api/src/categorization/categorization.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { OverrideMerchantCategory } from './use-cases/override-merchant.use-case';
import { OverrideTransactionCategory } from './use-cases/override-transaction.use-case';
import { CreateCategory } from './use-cases/create-category.use-case';
import { RenameCategory } from './use-cases/rename-category.use-case';
import { DeleteCategory } from './use-cases/delete-category.use-case';
import { ListCategories } from './use-cases/list-categories.use-case';
import { CategorizationController } from './interface/categorization.controller';

@Module({
  imports: [TransactionsModule, BudgetsModule],
  controllers: [CategorizationController],
  providers: [
    OverrideMerchantCategory,
    OverrideTransactionCategory,
    CreateCategory,
    RenameCategory,
    DeleteCategory,
    ListCategories,
  ],
})
export class CategorizationModule {}
```

`CATEGORIES_REPOSITORY`, `CategoryRegistry`, and `CATEGORIZATION_REPOSITORY` come from the `@Global()` `SharedModule`. `CategorizationModule` is already registered in `app.module.ts` — no change there.

- [ ] **Step 4: Verify the build and the full test suite**

Run: `cd apps/api && bun run build && bun test`
Expected: build succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/shared.module.ts apps/api/src/budgets/budgets.module.ts apps/api/src/categorization/categorization.module.ts
git commit -m "feat: wire category-management use-cases and registry into the api"
```

---

## Task 17: Registry validation in transaction use-cases (TDD)

**Files:**
- Modify: `apps/api/src/transactions/use-cases/add.use-case.ts`
- Modify: `apps/api/src/transactions/use-cases/update.use-case.ts`
- Test: `apps/api/src/transactions/use-cases/add.use-case.test.ts`
- Test: `apps/api/src/transactions/use-cases/update.use-case.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `apps/api/src/transactions/use-cases/add.use-case.test.ts` with:

```typescript
import { test, expect } from 'bun:test';
import { AddTransaction } from './add.use-case';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import {
  fakeCategoriesRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
  fixedClock,
} from '../../shared/testing/fakes';

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('add defaults the date to today and currency to ARS', async () => {
  const repo = fakeTransactionsRepo();
  const useCase = new AddTransaction(
    repo,
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
  );
  const { transaction } = await useCase.execute({
    amount: 3000,
    description: 'Café',
    merchant: 'Starbucks',
    category: 'comida',
  });
  expect(transaction.date).toBe('2026-05-17');
  expect(transaction.currency).toBe('ARS');
  expect(await repo.all()).toHaveLength(1);
});

test('add falls back to a merchant rule, then to otros', async () => {
  const withRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo({ merchants: { Coderhouse: 'educacion' } })),
    fixedClock('2026-05-17'),
    registry(),
  );
  const ruled = await withRule.execute({ amount: 50000, description: 'Curso', merchant: 'Coderhouse' });
  expect(ruled.transaction.category).toBe('educacion');

  const noRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
  );
  const unruled = await noRule.execute({ amount: 1000, description: 'X', merchant: 'Desconocido' });
  expect(unruled.transaction.category).toBe('otros');
});

test('add accepts a custom category that exists in the registry', async () => {
  const useCase = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
  );
  const { transaction } = await useCase.execute({
    amount: 2000,
    description: 'Alimento',
    merchant: 'Pet Shop',
    category: 'mascotas',
  });
  expect(transaction.category).toBe('mascotas');
});

test('add rejects a category that is not in the registry', async () => {
  const useCase = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
  );
  await expect(
    useCase.execute({ amount: 2000, description: 'X', merchant: 'Y', category: 'inventada' }),
  ).rejects.toThrow(DomainError);
});
```

Replace the contents of `apps/api/src/transactions/use-cases/update.use-case.test.ts` with:

```typescript
import { test, expect } from 'bun:test';
import { UpdateTransaction } from './update.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo, fakeTransactionsRepo } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const seed: Transaction = {
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: '',
  merchant: 'Coto',
};

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('update applies the given fields to an existing transaction', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  const { transaction } = await useCase.execute({
    transactionId: 'txn_001',
    fields: { amount: 5000 },
  });
  expect(transaction.amount).toBe(5000);
});

test('update accepts a custom category from the registry', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  const { transaction } = await useCase.execute({
    transactionId: 'txn_001',
    fields: { category: 'mascotas' },
  });
  expect(transaction.category).toBe('mascotas');
});

test('update rejects an unknown category', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  await expect(
    useCase.execute({ transactionId: 'txn_001', fields: { category: 'inventada' } }),
  ).rejects.toThrow(DomainError);
});

test('update on an unknown id throws NOT_FOUND', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  await expect(
    useCase.execute({ transactionId: 'txn_999', fields: { amount: 1 } }),
  ).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/transactions/use-cases/add.use-case.test.ts src/transactions/use-cases/update.use-case.test.ts`
Expected: FAIL — `AddTransaction` / `UpdateTransaction` constructors do not accept the registry argument.

- [ ] **Step 3: Add validation to `AddTransaction`**

Replace the contents of `apps/api/src/transactions/use-cases/add.use-case.ts` with:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
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
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: AddTransactionInput): Promise<{ transaction: Transaction }> {
    if (input.category && !(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }
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

- [ ] **Step 4: Add validation to `UpdateTransaction`**

Replace the contents of `apps/api/src/transactions/use-cases/update.use-case.ts` with:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CategoryRegistry } from '../../shared/providers/category-registry';
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
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: UpdateTransactionInput): Promise<{ transaction: Transaction }> {
    if (input.fields.category && !(await this.registry.exists(input.fields.category))) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `"${input.fields.category}" no es una categoría válida.`,
      );
    }
    const tx = await this.repo.update(input.transactionId, input.fields);
    if (!tx) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    return { transaction: tx };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && bun test src/transactions/use-cases/add.use-case.test.ts src/transactions/use-cases/update.use-case.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/transactions/use-cases/add.use-case.ts apps/api/src/transactions/use-cases/update.use-case.ts apps/api/src/transactions/use-cases/add.use-case.test.ts apps/api/src/transactions/use-cases/update.use-case.test.ts
git commit -m "feat: validate categories in transaction use-cases"
```

---

## Task 18: Registry validation in categorization override use-cases (TDD)

**Files:**
- Modify: `apps/api/src/categorization/use-cases/override-merchant.use-case.ts`
- Modify: `apps/api/src/categorization/use-cases/override-transaction.use-case.ts`
- Test: `apps/api/src/categorization/use-cases/override-merchant.use-case.test.ts`
- Test: `apps/api/src/categorization/use-cases/override-transaction.use-case.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `apps/api/src/categorization/use-cases/override-merchant.use-case.test.ts` with:

```typescript
import { test, expect } from 'bun:test';
import { OverrideMerchantCategory } from './override-merchant.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo, fakeCategorizationRepo } from '../../shared/testing/fakes';

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('override-merchant persists the rule', async () => {
  const repo = fakeCategorizationRepo();
  const result = await new OverrideMerchantCategory(repo, registry()).execute({
    merchant: 'Coderhouse',
    category: 'educacion',
  });
  expect(result).toEqual({ merchant: 'Coderhouse', category: 'educacion' });
  expect((await repo.overrides()).merchants.Coderhouse).toBe('educacion');
});

test('override-merchant accepts a custom category', async () => {
  const repo = fakeCategorizationRepo();
  await new OverrideMerchantCategory(repo, registry()).execute({
    merchant: 'Pet Shop',
    category: 'mascotas',
  });
  expect((await repo.overrides()).merchants['Pet Shop']).toBe('mascotas');
});

test('override-merchant rejects an unknown category', async () => {
  const useCase = new OverrideMerchantCategory(fakeCategorizationRepo(), registry());
  await expect(
    useCase.execute({ merchant: 'X', category: 'inventada' }),
  ).rejects.toThrow(DomainError);
});
```

Replace the contents of `apps/api/src/categorization/use-cases/override-transaction.use-case.test.ts` with:

```typescript
import { test, expect } from 'bun:test';
import { OverrideTransactionCategory } from './override-transaction.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import {
  fakeCategoriesRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
} from '../../shared/testing/fakes';
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

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('override-transaction persists the exception for an existing tx', async () => {
  const cat = fakeCategorizationRepo();
  const useCase = new OverrideTransactionCategory(cat, fakeTransactionsRepo([seed]), registry());
  await useCase.execute({ transactionId: 'txn_001', category: 'salud' });
  expect((await cat.overrides()).transactions.txn_001).toBe('salud');
});

test('override-transaction accepts a custom category', async () => {
  const cat = fakeCategorizationRepo();
  const useCase = new OverrideTransactionCategory(cat, fakeTransactionsRepo([seed]), registry());
  await useCase.execute({ transactionId: 'txn_001', category: 'mascotas' });
  expect((await cat.overrides()).transactions.txn_001).toBe('mascotas');
});

test('override-transaction on an unknown id throws NOT_FOUND', async () => {
  const useCase = new OverrideTransactionCategory(
    fakeCategorizationRepo(),
    fakeTransactionsRepo([seed]),
    registry(),
  );
  await expect(
    useCase.execute({ transactionId: 'txn_999', category: 'salud' }),
  ).rejects.toThrow(DomainError);
});

test('override-transaction rejects an unknown category', async () => {
  const useCase = new OverrideTransactionCategory(
    fakeCategorizationRepo(),
    fakeTransactionsRepo([seed]),
    registry(),
  );
  await expect(
    useCase.execute({ transactionId: 'txn_001', category: 'inventada' }),
  ).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/categorization/use-cases/override-merchant.use-case.test.ts src/categorization/use-cases/override-transaction.use-case.test.ts`
Expected: FAIL — constructors do not accept the registry argument.

- [ ] **Step 3: Add validation to `OverrideMerchantCategory`**

Replace the contents of `apps/api/src/categorization/use-cases/override-merchant.use-case.ts` with:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../../shared/domain/category';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
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
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: OverrideMerchantInput): Promise<OverrideMerchantInput> {
    if (!(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }
    await this.repo.setMerchant(input.merchant, input.category);
    return { merchant: input.merchant, category: input.category };
  }
}
```

- [ ] **Step 4: Add validation to `OverrideTransactionCategory`**

Replace the contents of `apps/api/src/categorization/use-cases/override-transaction.use-case.ts` with:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../../shared/domain/category';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
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
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: OverrideTransactionInput): Promise<OverrideTransactionInput> {
    if (!(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }
    const exists = (await this.txRepo.all()).some((t) => t.id === input.transactionId);
    if (!exists) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    await this.repo.setTransaction(input.transactionId, input.category);
    return { transactionId: input.transactionId, category: input.category };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && bun test src/categorization/use-cases/override-merchant.use-case.test.ts src/categorization/use-cases/override-transaction.use-case.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/categorization/use-cases/override-merchant.use-case.ts apps/api/src/categorization/use-cases/override-transaction.use-case.ts apps/api/src/categorization/use-cases/override-merchant.use-case.test.ts apps/api/src/categorization/use-cases/override-transaction.use-case.test.ts
git commit -m "feat: validate categories in categorization override use-cases"
```

---

## Task 19: Registry validation in SetBudget (TDD)

**Files:**
- Modify: `apps/api/src/budgets/use-cases/set-budget.use-case.ts`
- Test: `apps/api/src/budgets/use-cases/budgets.use-cases.test.ts` (modify)

- [ ] **Step 1: Update the budgets test**

In `apps/api/src/budgets/use-cases/budgets.use-cases.test.ts`, add these imports next to the existing imports:

```typescript
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo } from '../../shared/testing/fakes';
```

Replace the existing `set-budget` test with these three:

```typescript
test('set-budget stores the amount under the current month', async () => {
  const repo = fakeBudgetsRepo();
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const result = await new SetBudget(repo, fixedClock('2026-05-17'), registry).execute({
    category: 'comida',
    amount: 50000,
  });
  expect(result).toEqual({ category: 'comida', amount: 50000, month: '2026-05' });
  expect(await repo.forMonth('2026-05')).toEqual({ comida: 50000 });
});

test('set-budget accepts a custom category', async () => {
  const repo = fakeBudgetsRepo();
  const registry = new CategoryRegistry(fakeCategoriesRepo(['mascotas']));
  await new SetBudget(repo, fixedClock('2026-05-17'), registry).execute({
    category: 'mascotas',
    amount: 8000,
  });
  expect(await repo.forMonth('2026-05')).toEqual({ mascotas: 8000 });
});

test('set-budget rejects an unknown category', async () => {
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const useCase = new SetBudget(fakeBudgetsRepo(), fixedClock('2026-05-17'), registry);
  await expect(useCase.execute({ category: 'inventada', amount: 1000 })).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test src/budgets/use-cases/budgets.use-cases.test.ts`
Expected: FAIL — `SetBudget` constructor does not accept the registry argument.

- [ ] **Step 3: Add validation to `SetBudget`**

Replace the contents of `apps/api/src/budgets/use-cases/set-budget.use-case.ts` with:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
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
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: SetBudgetInput) {
    if (!(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }
    const month = monthKey(this.clock.now());
    await this.repo.set(month, input.category, input.amount);
    return { category: input.category, amount: input.amount, month };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test src/budgets/use-cases/budgets.use-cases.test.ts`
Expected: PASS — all budgets tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/budgets/use-cases/set-budget.use-case.ts apps/api/src/budgets/use-cases/budgets.use-cases.test.ts
git commit -m "feat: validate categories in set-budget use-case"
```

---

## Task 20: Registry validation in SumByCategory (TDD)

**Files:**
- Modify: `apps/api/src/spending/use-cases/sum-by-category.use-case.ts`
- Test: `apps/api/src/spending/use-cases/spending.use-cases.test.ts` (modify)

- [ ] **Step 1: Read the current use-case**

Open `apps/api/src/spending/use-cases/sum-by-category.use-case.ts` and note its constructor signature and `execute` body — Step 3 adds a `CategoryRegistry` dependency and an up-front validation check while leaving the existing summation logic unchanged.

- [ ] **Step 2: Update the spending test**

In `apps/api/src/spending/use-cases/spending.use-cases.test.ts`, add these imports next to the existing imports:

```typescript
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo } from '../../shared/testing/fakes';
```

Add this constant after the existing `categories` constant (`const categories = new CategoryResolver(...)`):

```typescript
const registry = new CategoryRegistry(fakeCategoriesRepo());
```

Update the two `new SumByCategory(...)` call sites to pass `registry` as the final argument. The first:

```typescript
  const result = await new SumByCategory(fakeTransactionsRepo(seed), periods, categories, registry).execute({
    category: 'comida',
    period: { kind: 'currentMonth' },
  });
```

The second (inside the `'an override moves spend into the corrected category'` test):

```typescript
  const result = await new SumByCategory(fakeTransactionsRepo(seed), periods, withOverride, registry).execute({
    category: 'comida',
    period: { kind: 'currentMonth' },
  });
```

Append this test at the end of the file:

```typescript
test('sum-by-category rejects an unknown category', async () => {
  const useCase = new SumByCategory(fakeTransactionsRepo(seed), periods, categories, registry);
  await expect(
    useCase.execute({ category: 'inventada', period: { kind: 'currentMonth' } }),
  ).rejects.toThrow(DomainError);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && bun test src/spending/use-cases/spending.use-cases.test.ts`
Expected: FAIL — `SumByCategory` constructor does not accept the registry argument.

- [ ] **Step 4: Add validation to `SumByCategory`**

In `apps/api/src/spending/use-cases/sum-by-category.use-case.ts`, make three edits:

1. Add these imports next to the existing imports:

```typescript
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
```

2. Add `CategoryRegistry` as the last constructor parameter, matching the existing constructor's `private readonly` injected-field style:

```typescript
    private readonly registry: CategoryRegistry,
```

3. As the first statement of `execute`, before any existing logic:

```typescript
    if (!(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }
```

- [ ] **Step 5: Run the test and the build to verify they pass**

Run: `cd apps/api && bun run build && bun test src/spending/use-cases/spending.use-cases.test.ts`
Expected: build succeeds; all spending tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/spending/use-cases/sum-by-category.use-case.ts apps/api/src/spending/use-cases/spending.use-cases.test.ts
git commit -m "feat: validate category in sum-by-category use-case"
```

---

## Task 21: Extend the categorization gateway (ai)

**Files:**
- Modify: `apps/ai/src/categorization/domain/categorization.gateway.ts`

- [ ] **Step 1: Add the category-management schemas, types, and gateway methods**

Append the schemas and types to `apps/ai/src/categorization/domain/categorization.gateway.ts`, and extend the `CategorizationGateway` interface. After the existing `overrideTransactionResult` declaration, add:

```typescript
export const createCategoryInput = z.object({ name: z.string().min(1).max(24) });
export const createCategoryResult = z.object({ name: z.string() });

export const renameCategoryInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1).max(24),
});
export const renameCategoryResult = z.object({ from: z.string(), to: z.string() });

export const deleteCategoryInput = z.object({ name: z.string().min(1) });
export const deleteCategoryResult = z.object({ name: z.string() });

export const listCategoriesInput = z.object({});
export const listCategoriesResult = z.object({
  categories: z.array(z.object({ name: z.string(), isCustom: z.boolean() })),
});
```

After the existing `OverrideTransactionResult` type export, add:

```typescript
export type CreateCategoryInput = z.infer<typeof createCategoryInput>;
export type CreateCategoryResult = z.infer<typeof createCategoryResult>;
export type RenameCategoryInput = z.infer<typeof renameCategoryInput>;
export type RenameCategoryResult = z.infer<typeof renameCategoryResult>;
export type DeleteCategoryInput = z.infer<typeof deleteCategoryInput>;
export type DeleteCategoryResult = z.infer<typeof deleteCategoryResult>;
export type ListCategoriesInput = z.infer<typeof listCategoriesInput>;
export type ListCategoriesResult = z.infer<typeof listCategoriesResult>;
```

Replace the `CategorizationGateway` interface with:

```typescript
export interface CategorizationGateway {
  overrideMerchant(input: OverrideMerchantInput, ctx: GatewayCtx): Promise<OverrideMerchantResult>;
  overrideTransaction(input: OverrideTransactionInput, ctx: GatewayCtx): Promise<OverrideTransactionResult>;
  create(input: CreateCategoryInput, ctx: GatewayCtx): Promise<CreateCategoryResult>;
  rename(input: RenameCategoryInput, ctx: GatewayCtx): Promise<RenameCategoryResult>;
  remove(input: DeleteCategoryInput, ctx: GatewayCtx): Promise<DeleteCategoryResult>;
  list(input: ListCategoriesInput, ctx: GatewayCtx): Promise<ListCategoriesResult>;
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/categorization/domain/categorization.gateway.ts
git commit -m "feat: add category-management methods to the categorization gateway"
```

---

## Task 22: Extend the HTTP categorization gateway (ai)

**Files:**
- Modify: `apps/ai/src/categorization/providers/http-categorization.gateway.ts`

- [ ] **Step 1: Add the new routes**

Replace the contents of `apps/ai/src/categorization/providers/http-categorization.gateway.ts` with:

```typescript
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { CategorizationGateway } from '../domain/categorization.gateway';

export function makeHttpCategorizationGateway(api: ApiClient): CategorizationGateway {
  return makeHttpGateway<CategorizationGateway>(api, {
    overrideMerchant: '/categorization/merchant',
    overrideTransaction: '/categorization/transaction',
    create: '/categorization/create-category',
    rename: '/categorization/rename-category',
    remove: '/categorization/delete-category',
    list: '/categorization/list-categories',
  });
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/categorization/providers/http-categorization.gateway.ts
git commit -m "feat: add category-management routes to the HTTP categorization gateway"
```

---

## Task 23: Add the category Mastra tools (ai)

**Files:**
- Modify: `apps/ai/src/categorization/interface/categorization.tools.ts`

- [ ] **Step 1: Add the four tools to `makeCategorizationTools`**

Replace the contents of `apps/ai/src/categorization/interface/categorization.tools.ts` with:

```typescript
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/categorization.gateway';
import type { CategorizationGateway } from '../domain/categorization.gateway';

export function makeCategorizationTools(gateway: CategorizationGateway) {
  return {
    overrideMerchantCategory: createGatewayTool({
      id: 'overrideMerchantCategory',
      description: 'Set a per-merchant category rule that future aggregations honor.',
      inputSchema: s.overrideMerchantInput,
      outputSchema: s.overrideMerchantResult,
      call: (i, c) => gateway.overrideMerchant(i, c),
    }),
    overrideTransactionCategory: createGatewayTool({
      id: 'overrideTransactionCategory',
      description: "Override one transaction's category without changing the merchant's default.",
      inputSchema: s.overrideTransactionInput,
      outputSchema: s.overrideTransactionResult,
      call: (i, c) => gateway.overrideTransaction(i, c),
    }),
    createCategory: createGatewayTool({
      id: 'createCategory',
      description:
        'Create a new custom spending category. Non-destructive — no confirmation needed.',
      inputSchema: s.createCategoryInput,
      outputSchema: s.createCategoryResult,
      call: (i, c) => gateway.create(i, c),
    }),
    renameCategory: createGatewayTool({
      id: 'renameCategory',
      description:
        'Rename a custom category. Existing transactions, overrides and budgets follow the rename. The seven default categories cannot be renamed.',
      inputSchema: s.renameCategoryInput,
      outputSchema: s.renameCategoryResult,
      call: (i, c) => gateway.rename(i, c),
    }),
    deleteCategory: createGatewayTool({
      id: 'deleteCategory',
      description:
        'Delete a custom category. Everything assigned to it falls back to "otros" — state this plainly before calling. The seven default categories cannot be deleted.',
      inputSchema: s.deleteCategoryInput,
      outputSchema: s.deleteCategoryResult,
      call: (i, c) => gateway.remove(i, c),
    }),
    listCategories: createGatewayTool({
      id: 'listCategories',
      description: 'List every spending category — the seven defaults and any custom ones.',
      inputSchema: s.listCategoriesInput,
      outputSchema: s.listCategoriesResult,
      call: (i, c) => gateway.list(i, c),
    }),
  };
}
```

`mastra/index.ts` already calls `makeCategorizationTools(...)`, so the four new tools are registered automatically — no wiring change here.

- [ ] **Step 2: Verify the build still compiles**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/categorization/interface/categorization.tools.ts
git commit -m "feat: add category-management tools to the agent"
```

---

## Task 24: Inject the live category list into the request context

**Files:**
- Modify: `apps/ai/src/agent/gasti-agent.ts`
- Modify: `apps/ai/src/mastra/index.ts`

- [ ] **Step 1: Extend the request-context schema**

In `apps/ai/src/agent/gasti-agent.ts`, change the `requestContextSchema` line to:

```typescript
    requestContextSchema: z.object({
      today: z.string(),
      userId: z.string(),
      categories: z.array(z.string()),
    }),
```

- [ ] **Step 2: Fetch the category list in the server middleware**

In `apps/ai/src/mastra/index.ts`, add this import next to the existing imports:

```typescript
import { DEFAULT_CATEGORIES } from '../shared/domain/category';
```

Add this constant after `const api = makeApiClient();`:

```typescript
const categorizationGateway = makeHttpCategorizationGateway(api);
```

Change the `tools` object's categorization line from `...makeCategorizationTools(makeHttpCategorizationGateway(api)),` to:

```typescript
  ...makeCategorizationTools(categorizationGateway),
```

Replace the middleware function body with:

```typescript
      async (context, next) => {
        const requestContext = context.get('requestContext');
        requestContext.set('today', new Date().toISOString().slice(0, 10));
        requestContext.set('userId', 'default-user');
        try {
          const { categories } = await categorizationGateway.list({}, { userId: 'default-user' });
          requestContext.set(
            'categories',
            categories.map((c) => c.name),
          );
        } catch {
          requestContext.set('categories', [...DEFAULT_CATEGORIES]);
        }
        await next();
      },
```

- [ ] **Step 3: Verify the build still compiles**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ai/src/agent/gasti-agent.ts apps/ai/src/mastra/index.ts
git commit -m "feat: load the live category list per agent request"
```

---

## Task 25: Rewrite the agent CATEGORIES instructions

**Files:**
- Modify: `apps/ai/src/agent/instructions.ts`

- [ ] **Step 1: Read the live categories in `buildInstructions`**

In `apps/ai/src/agent/instructions.ts`, add this import at the top:

```typescript
import { DEFAULT_CATEGORIES } from '../shared/domain/category';
```

After the existing `const today = ...` line inside `buildInstructions`, add:

```typescript
  const categories =
    (requestContext.get('categories') as string[] | undefined) ?? [...DEFAULT_CATEGORIES];
  const categoryList = categories.join(', ');
```

- [ ] **Step 2: Replace the CATEGORIES block**

In the returned template string, replace the entire `CATEGORIES` block (the four lines from `CATEGORIES` through `...never a silent fallback for a category you could not match.`) with:

```
CATEGORIES
- The user's spending categories right now are: ${categoryList}. This set is dynamic — the user can create their own.
- The first seven (comida, transporte, entretenimiento, salud, servicios, educacion, otros) are fixed defaults: they cannot be renamed or deleted. Any beyond those are custom categories the user created.
- If the user names a category that is NOT in the list above — whether asking about it, adding a transaction with it, or assigning a merchant/transaction to it — do NOT silently substitute "otros". Tell them it is not a category yet and ask if they want to create it. On an affirmative reply, call createCategory and then carry out what they originally asked.
- "otros" is the catch-all ONLY when the user explicitly chooses it — never a silent fallback for a category you could not match.
- To rename or delete a custom category, use renameCategory or deleteCategory. Deleting a category reassigns everything in it to "otros" — say so plainly before doing it. The seven defaults cannot be renamed or deleted; if asked, explain that.
- Use listCategories when the user asks which categories exist.
```

- [ ] **Step 3: Verify the build still compiles**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ai/src/agent/instructions.ts
git commit -m "feat: teach the agent about custom categories"
```

---

## Task 26: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Build every workspace**

Run: `bun run build`
Expected: turbo builds `api`, `ai`, and `ui` successfully.

- [ ] **Step 2: Run the api test suite**

Run: `cd apps/api && bun test`
Expected: all tests pass — existing suites plus `category-name.test.ts` (2 tests) and `category-management.use-cases.test.ts` (12 tests), and the registry-validation tests added to transactions, categorization, budgets, and spending.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Run `bun dev` from the repo root. In the chat: `creá una categoría llamada mascotas` → expect a `createCategory` call. Then `agregá un gasto de 5000 en Pet Shop, categoría mascotas` → expect `addTransaction` with `category: "mascotas"`. Then `¿cuánto gasté en mascotas?` and `borrá la categoría mascotas` → expect Gasti to note the fallback to `otros` before calling `deleteCategory`. Confirm `agregá un gasto de 1000 en X categoría inventada` makes Gasti offer to create the category rather than silently using `otros`.

---

## Self-Review

**Spec coverage:**
- Create a category → Task 11 (`CreateCategory`) + tool in Task 23.
- Inline create → Task 25 (instructions: offer to create unknown names) + the create tool.
- Assign a custom category as base category → Task 17 (registry validation in `AddTransaction` / `UpdateTransaction`, which accept custom names); as override → Task 18.
- Rename → Task 12 (`RenameCategory`, full cascade) + tool in Task 23.
- Delete → Task 13 (`DeleteCategory`, cascade to `otros` + budget clear) + tool in Task 23.
- List → Task 14 (`ListCategories`) + tool in Task 23.
- Budgets/breakdowns/comparisons work with custom categories → the `categorySchema` widening (Tasks 1–2) plus `SetBudget` validation (Task 19); breakdown/compare embed `categorySchema` and need no change.
- Registry + sidecar storage → Tasks 3, 4, 9; seed schema untouched (only `category.ts` changes, and it keeps the `categorySchema` export name so no import site changes).
- Folded into the existing `categorization/` feature → Tasks 4, 10–16 add files/wiring inside `categorization/`; Tasks 21–23 extend the ai `categorization/` files. No new feature folder, no `CategoriesModule`.
- `categorySchema` enum → open string → Tasks 1–2.
- Cascade infrastructure → Tasks 5, 6, 7 (`reassignCategory` / `clearCategory`).
- Agent live category list → Task 24 (request context) + Task 25 (instructions).
- `CategoryIcon` fallback → already present; no task needed (confirmed in the file).
- Tests in apps/api → Tasks 10–14, 17–20.

**Placeholder scan:** No TBD/TODO/vague steps. Task 20 Step 1 asks the engineer to read a file first because the edit is described as three targeted point-edits — the exact code for each point is fully specified in Step 4.

**Type consistency:** `CategoriesRepository` (`all`/`add`/`remove`/`rename`) is identical across the contract (Task 3), JSON repo (Task 4), and fake (Task 8). `CATEGORIES_REPOSITORY` token is consistent. `CategoryRegistry` methods (`all`/`exists`/`isDefault`/`isCustom`) match every call site. `reassignCategory` signature `(from, to)` is consistent across the transactions, categorization, and budgets repositories and their fakes. `RenameCategory` / `DeleteCategory` constructors take `(categoriesRepo, txRepo, catRepo, budgetsRepo, registry)` — matching their test call sites in Tasks 12–13. The ai gateway method names (`create`/`rename`/`remove`/`list`) match the HTTP route map (Task 22) and the tool `call` references (Task 23).
