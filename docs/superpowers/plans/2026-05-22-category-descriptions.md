# Category Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable semantic `description` to every category (the 7 defaults + custom). Cherry-pick the MP classifier into this branch, generalize it to consume those descriptions, and use it inside `AddTransaction` whenever the category is unknown. Expose edits via Mastra tools and a new `/settings/categories` UI.

**Architecture:** Three apps touched. `apps/api` owns the new domain shape (`CategoryDefinition`, override repo, resolver), the new use-cases (`UpdateCategoryDescription`, `ResetCategoryDescription`), the new HTTP endpoints, and the HTTP client for the classifier. `apps/ai` gains a new Mastra workflow (`classify-transaction`) generalized from the MP classifier; the agent prompt switches from listing category *names* to listing `- name: description` pairs. `apps/ui` gains a settings page with a header affordance to reach it.

**Tech Stack:** TypeScript end-to-end. NestJS (api), Mastra 1.33 + AI SDK OpenAI (ai), Next.js 15 + Tailwind 3 (ui), Bun workspaces + Turborepo, `bun:test` for tests, JSON file repos in `data/`.

**Spec:** `docs/superpowers/specs/2026-05-22-category-descriptions-design.md`

**Source branch for cherry-pick:** `worktree-proactive-mercadopago` (files only; not `git cherry-pick`).

---

## Conventions for every task

- All file paths are relative to the worktree root `C:\Users\Usuario\Desktop\gasti-challenge\.claude\worktrees\category-descriptions\`.
- `bun test --filter <pattern>` does not exist in this repo; tests run via `cd apps/api && bun test` (or with a path filter: `cd apps/api && bun test src/path/file.test.ts`).
- Commit messages follow the repo style: single-line subjects, lowercase imperative, conventional prefix (`feat:`, `feat(api):`, `feat(ai):`, `feat(ui):`, `fix:`, `refactor:`, `docs:`, `test:`). No body unless asked.
- After every commit, ensure `bun test` still passes for the affected app(s).
- If a step's test code references types or methods you have not defined yet in an earlier task, that is a plan bug — file an issue and fix the plan first.

---

# Phase 1 — Domain shape

Pure types. Compiles but nothing runs end-to-end yet. No tests in this phase — types alone.

## Task 1.1: Extend `apps/api` category domain with `CategoryDefinition`

**Files:**
- Modify: `apps/api/src/shared/domain/category.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { z } from 'zod';

export interface CategoryDefinition {
  readonly name: string;
  readonly description: string;
}

/** The seven built-in categories with seed descriptions. Custom categories are added on top at runtime. */
export const DEFAULT_CATEGORIES: readonly CategoryDefinition[] = [
  { name: 'comida',          description: 'Restaurantes, delivery, supermercados, almacenes, kioscos, cafés.' },
  { name: 'transporte',      description: 'Uber, Cabify, taxi, colectivo, subte, SUBE, combustible, peajes, estacionamiento.' },
  { name: 'entretenimiento', description: 'Streaming (Netflix, Spotify), juegos, cine, bares, salidas, eventos.' },
  { name: 'salud',           description: 'Farmacia, médicos, obra social, prepaga, gimnasio, terapia.' },
  { name: 'servicios',       description: 'Luz, gas, agua, internet, telefonía, expensas, suscripciones funcionales (Drive, iCloud).' },
  { name: 'educacion',       description: 'Cursos, colegiatura, universidad, libros, capacitaciones, idiomas.' },
  { name: 'otros',           description: 'Catch-all explícito cuando el usuario lo elige. Nunca es una caída silenciosa.' },
];

/** Just the names — used wherever the legacy contract expected `string[]`. */
export const DEFAULT_CATEGORY_NAMES: readonly string[] = DEFAULT_CATEGORIES.map((c) => c.name);

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

- [ ] **Step 2: Fix every consumer that imported `DEFAULT_CATEGORIES` expecting `string[]`**

Run from worktree root:

```bash
grep -rn "DEFAULT_CATEGORIES" apps/api/src
```

Expected callers and the fix in each:
- `apps/api/src/shared/providers/category-registry.ts` — `[...DEFAULT_CATEGORIES, ...(await this.repo.all())]`. Change to: `[...DEFAULT_CATEGORY_NAMES, ...(await this.repo.all()).map((c) => c.name)]`.
- `apps/api/src/shared/providers/category-registry.ts` — `(DEFAULT_CATEGORIES as readonly string[]).includes(name)` inside `isDefault`. Change to: `DEFAULT_CATEGORY_NAMES.includes(name)`.

(The repo `.all()` shape changes in Task 1.2; the `.map((c) => c.name)` works *after* both tasks land. To keep this task compiling on its own, do not touch the repo .all() call yet — Task 1.2 will revisit.)

- [ ] **Step 3: Compile check**

```bash
cd apps/api && bun run build
```

Expected: PASS (or only complaints about the repo .all() shape — those resolve in Task 1.2).

- [ ] **Step 4: Do NOT commit yet — bundle with Task 1.2 into a single commit**

## Task 1.2: Extend custom categories repo contract

**Files:**
- Modify: `apps/api/src/shared/domain/custom-categories.ts`

- [ ] **Step 1: Rewrite the file**

```ts
export const CATEGORIES_REPOSITORY = 'CATEGORIES_REPOSITORY';

/** A user-created category with its semantic description. */
export interface CustomCategoryDefinition {
  readonly name: string;
  readonly description: string;
}

/** The user-created categories. The seven defaults are NOT stored here. */
export type CustomCategories = CustomCategoryDefinition[];

export const EMPTY_CUSTOM_CATEGORIES: CustomCategories = [];

export interface CategoriesRepository {
  all(): Promise<CustomCategories>;
  /** Idempotent: if a category with `name` already exists, do nothing. */
  add(name: string, description: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Preserves the description while renaming. */
  rename(from: string, to: string): Promise<void>;
  /** Idempotent: if the category does not exist, this is a no-op. */
  setDescription(name: string, description: string): Promise<void>;
}
```

- [ ] **Step 2: Re-check Task 1.1 step 2's caller fix in `category-registry.ts`**

Open `apps/api/src/shared/providers/category-registry.ts` and confirm `.all()` is mapped through `.map((c) => c.name)` everywhere it used to spread directly. Apply that change now.

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORY_NAMES } from '../domain/category';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../domain/custom-categories';

@Injectable()
export class CategoryRegistry {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
  ) {}

  async all(): Promise<string[]> {
    const customs = await this.repo.all();
    return [...DEFAULT_CATEGORY_NAMES, ...customs.map((c) => c.name)];
  }

  async exists(name: string): Promise<boolean> {
    return (await this.all()).includes(name);
  }

  isDefault(name: string): boolean {
    return DEFAULT_CATEGORY_NAMES.includes(name);
  }

  async isCustom(name: string): Promise<boolean> {
    const customs = await this.repo.all();
    return customs.some((c) => c.name === name);
  }
}
```

- [ ] **Step 3: Build to see remaining errors**

```bash
cd apps/api && bun run build
```

Expected: PASS. Failures will come from: (a) `JsonCategoriesRepository` which still implements the old interface — resolved in Phase 2; (b) `CreateCategory` use-case calling `repo.add(name)` with one arg — resolved by adjusting to `repo.add(name, '')` here, then properly in Task 3.5.

Quick patch in `apps/api/src/categorization/use-cases/create-category.use-case.ts` line where it calls `this.repo.add(name)`: change to `this.repo.add(name, '')`. (Task 3.5 will add a real `description` parameter to the use-case input.)

In `apps/api/src/categorization/repositories/json-categories.repository.ts`, the body is broken until Phase 2. Leave a `@ts-expect-error TODO Task 2.1` over every broken method, or temporarily stub them to throw `new Error('Task 2.1')`. The latter is preferred — easier to find:

```ts
async all(): Promise<CustomCategories> { throw new Error('TODO Task 2.1'); }
async add(_name: string, _description: string): Promise<void> { throw new Error('TODO Task 2.1'); }
async remove(_name: string): Promise<void> { throw new Error('TODO Task 2.1'); }
async rename(_from: string, _to: string): Promise<void> { throw new Error('TODO Task 2.1'); }
async setDescription(_name: string, _description: string): Promise<void> { throw new Error('TODO Task 2.1'); }
```

- [ ] **Step 4: Build check**

```bash
cd apps/api && bun run build
```

Expected: PASS. Tests will fail because they call `repo.all()` expecting `string[]` — that's fine, we fix in Phase 2.

- [ ] **Step 5: Do NOT commit yet — bundle with Task 1.3 / 1.4 / 1.5 / 1.6**

## Task 1.3: Create `default-category-overrides.ts` domain file

**Files:**
- Create: `apps/api/src/shared/domain/default-category-overrides.ts`

- [ ] **Step 1: Write the file**

```ts
export const DEFAULT_CATEGORY_OVERRIDES_REPOSITORY = 'DEFAULT_CATEGORY_OVERRIDES_REPOSITORY';

/**
 * User-supplied descriptions for the seven default categories. Only names
 * present here have an override; absent names fall back to the seed.
 *
 * The default category NAMES themselves are immutable — this map keys on the
 * default name and only the description can be customised.
 */
export type DefaultCategoryOverrides = Record<string, string>;

export interface DefaultCategoryOverridesRepository {
  all(): Promise<DefaultCategoryOverrides>;
  set(name: string, description: string): Promise<void>;
  /** Idempotent: removing a key that is not present is a no-op. */
  reset(name: string): Promise<void>;
}
```

- [ ] **Step 2: Build check**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 1.4: Extend `Transaction` with classification metadata

**Files:**
- Modify: `apps/api/src/shared/domain/transaction.ts`

- [ ] **Step 1: Inspect current file**

```bash
cat apps/api/src/shared/domain/transaction.ts
```

- [ ] **Step 2: Add two optional fields to the `Transaction` interface AND to its Zod schema**

Add to the interface:

```ts
classificationConfidence?: number;
classificationSource?: 'manual' | 'override' | 'classifier' | 'fallback';
```

Add to the Zod schema (find `transactionSchema = z.object({ ... })` and extend):

```ts
classificationConfidence: z.number().min(0).max(1).optional(),
classificationSource: z.enum(['manual', 'override', 'classifier', 'fallback']).optional(),
```

- [ ] **Step 3: Build check**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 1.5: Mirror the shape change in `apps/ai`

**Files:**
- Modify: `apps/ai/src/shared/domain/category.ts`

- [ ] **Step 1: Rewrite the file to mirror `apps/api`**

```ts
import { z } from 'zod';

export interface CategoryDefinition {
  readonly name: string;
  readonly description: string;
}

/** The seven built-in categories with seed descriptions. Custom categories arrive at runtime. */
export const DEFAULT_CATEGORIES: readonly CategoryDefinition[] = [
  { name: 'comida',          description: 'Restaurantes, delivery, supermercados, almacenes, kioscos, cafés.' },
  { name: 'transporte',      description: 'Uber, Cabify, taxi, colectivo, subte, SUBE, combustible, peajes, estacionamiento.' },
  { name: 'entretenimiento', description: 'Streaming (Netflix, Spotify), juegos, cine, bares, salidas, eventos.' },
  { name: 'salud',           description: 'Farmacia, médicos, obra social, prepaga, gimnasio, terapia.' },
  { name: 'servicios',       description: 'Luz, gas, agua, internet, telefonía, expensas, suscripciones funcionales (Drive, iCloud).' },
  { name: 'educacion',       description: 'Cursos, colegiatura, universidad, libros, capacitaciones, idiomas.' },
  { name: 'otros',           description: 'Catch-all explícito cuando el usuario lo elige. Nunca es una caída silenciosa.' },
];

export const DEFAULT_CATEGORY_NAMES: readonly string[] = DEFAULT_CATEGORIES.map((c) => c.name);

/** A category name. Validity against the registry is checked server-side. */
export const categorySchema = z.string().min(1);
export type Category = z.infer<typeof categorySchema>;
```

- [ ] **Step 2: Find consumers in `apps/ai` and fix them**

```bash
grep -rn "DEFAULT_CATEGORIES" apps/ai/src
```

Expected hit: `apps/ai/src/mastra/index.ts` line ~55: `requestContext.set('categories', [...DEFAULT_CATEGORIES]);`. Leave it broken for now — Task 8.2 rewrites this middleware as part of the prompt rewiring. Add a `@ts-expect-error TODO Task 8.2` above it.

- [ ] **Step 3: Build check for `apps/ai`**

```bash
cd apps/ai && bun run build 2>&1 | tail -20
```

Expected: PASS, with possibly the `@ts-expect-error` line consuming the only real error.

## Task 1.6: Create the `TransactionClassifier` contract

**Files:**
- Create: `apps/api/src/categorization/domain/transaction-classifier.ts`

- [ ] **Step 1: Write the file**

```ts
import type { Category } from '../../shared/domain/category';

export const TRANSACTION_CLASSIFIER = 'TRANSACTION_CLASSIFIER';

export interface ClassifyArgs {
  readonly merchant: string;
  readonly description: string | null;
  readonly amount: number;
  readonly direction: 'expense' | 'income';
}

export interface Classification {
  readonly category: Category;
  readonly confidence: number;
  readonly reasoning?: string;
}

/** Classifies a single transaction into a category + confidence using the user's category descriptions. */
export interface TransactionClassifier {
  classify(args: ClassifyArgs): Promise<Classification>;
}

/** Used when the classifier is unreachable or returns an invalid response. */
export const FALLBACK_CLASSIFICATION: Classification = {
  category: 'otros',
  confidence: 0,
};
```

- [ ] **Step 2: Build check**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 1.7: Commit Phase 1

- [ ] **Step 1: Stage and commit**

```bash
git add apps/api/src/shared/domain/category.ts \
        apps/api/src/shared/domain/custom-categories.ts \
        apps/api/src/shared/domain/default-category-overrides.ts \
        apps/api/src/shared/domain/transaction.ts \
        apps/api/src/shared/providers/category-registry.ts \
        apps/api/src/categorization/repositories/json-categories.repository.ts \
        apps/api/src/categorization/use-cases/create-category.use-case.ts \
        apps/api/src/categorization/domain/transaction-classifier.ts \
        apps/ai/src/shared/domain/category.ts \
        apps/ai/src/mastra/index.ts \
        docs/superpowers/specs/2026-05-22-category-descriptions-design.md \
        docs/superpowers/plans/2026-05-22-category-descriptions.md

git commit -m "feat(domain): extend categories with semantic descriptions"
```

(Spec + plan files may already be tracked from previous commits — `git add` is idempotent.)

---

# Phase 2 — Repos, fakes, providers

Make the broken `JsonCategoriesRepository` work, add the new overrides repo, add the resolver, fix the test fakes, wire DI.

## Task 2.1: Implement `JsonCategoriesRepository` with lazy migration — write the test first

**Files:**
- Test: `apps/api/src/categorization/repositories/json-categories.repository.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, beforeEach } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonCategoriesRepository } from './json-categories.repository';

let dir: string;
let file: string;
let repo: JsonCategoriesRepository;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cats-'));
  file = path.join(dir, 'custom-categories.json');
  repo = new JsonCategoriesRepository(file);
});

test('reads old string[] format as { name, description: "" }[]', async () => {
  await fs.writeFile(file, JSON.stringify(['bocata', 'regalos']));
  expect(await repo.all()).toEqual([
    { name: 'bocata', description: '' },
    { name: 'regalos', description: '' },
  ]);
});

test('reads new {name, description}[] format unchanged', async () => {
  await fs.writeFile(file, JSON.stringify([{ name: 'bocata', description: 'sándwiches' }]));
  expect(await repo.all()).toEqual([{ name: 'bocata', description: 'sándwiches' }]);
});

test('add appends and persists in the new format', async () => {
  await fs.writeFile(file, JSON.stringify(['bocata']));
  await repo.add('regalos', 'cumpleaños y aniversarios');
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(raw).toEqual([
    { name: 'bocata', description: '' },
    { name: 'regalos', description: 'cumpleaños y aniversarios' },
  ]);
});

test('add is idempotent', async () => {
  await repo.add('regalos', 'a');
  await repo.add('regalos', 'b');
  expect(await repo.all()).toEqual([{ name: 'regalos', description: 'a' }]);
});

test('setDescription updates an existing category', async () => {
  await repo.add('regalos', 'inicial');
  await repo.setDescription('regalos', 'cumpleaños');
  expect(await repo.all()).toEqual([{ name: 'regalos', description: 'cumpleaños' }]);
});

test('setDescription on missing category is a no-op', async () => {
  await repo.setDescription('regalos', 'cumpleaños');
  expect(await repo.all()).toEqual([]);
});

test('rename preserves description', async () => {
  await repo.add('mascotas', 'gatos, perros, veterinario');
  await repo.rename('mascotas', 'animales');
  expect(await repo.all()).toEqual([{ name: 'animales', description: 'gatos, perros, veterinario' }]);
});

test('remove drops the entry including its description', async () => {
  await repo.add('mascotas', 'gatos');
  await repo.remove('mascotas');
  expect(await repo.all()).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api && bun test src/categorization/repositories/json-categories.repository.test.ts
```

Expected: FAIL — methods throw `Error('TODO Task 2.1')`.

## Task 2.2: Implement `JsonCategoriesRepository` to make the test pass

**Files:**
- Modify: `apps/api/src/categorization/repositories/json-categories.repository.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import {
  EMPTY_CUSTOM_CATEGORIES,
  type CategoriesRepository,
  type CustomCategories,
  type CustomCategoryDefinition,
} from '../../shared/domain/custom-categories';

/**
 * Default storage path; tests override by passing an explicit filePath.
 *
 * Lazy migration on read: an existing `custom-categories.json` from before this
 * feature is a `string[]`; we normalize each entry to `{ name, description: '' }`
 * so callers always see the new shape. The first write persists the new format.
 */
@Injectable()
export class JsonCategoriesRepository implements CategoriesRepository {
  private readonly store: JsonStore<unknown[]>;

  constructor(filePath?: string) {
    this.store = createJsonStore<unknown[]>(
      filePath ?? path.join(DATA_DIR, 'custom-categories.json'),
      [...EMPTY_CUSTOM_CATEGORIES],
    );
  }

  private normalize(raw: unknown[]): CustomCategories {
    return raw.map((entry) => {
      if (typeof entry === 'string') return { name: entry, description: '' };
      const e = entry as { name?: string; description?: string };
      return { name: String(e.name ?? ''), description: String(e.description ?? '') };
    }).filter((e): e is CustomCategoryDefinition => e.name.length > 0);
  }

  async all(): Promise<CustomCategories> {
    return this.normalize(await this.store.read());
  }

  async add(name: string, description: string): Promise<void> {
    const data = await this.all();
    if (data.some((c) => c.name === name)) return;
    data.push({ name, description });
    await this.store.write(data);
  }

  async remove(name: string): Promise<void> {
    const data = await this.all();
    await this.store.write(data.filter((c) => c.name !== name));
  }

  async rename(from: string, to: string): Promise<void> {
    const data = await this.all();
    await this.store.write(data.map((c) => (c.name === from ? { name: to, description: c.description } : c)));
  }

  async setDescription(name: string, description: string): Promise<void> {
    const data = await this.all();
    if (!data.some((c) => c.name === name)) return;
    await this.store.write(data.map((c) => (c.name === name ? { name: c.name, description } : c)));
  }
}
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api && bun test src/categorization/repositories/json-categories.repository.test.ts
```

Expected: PASS (all 8 cases).

## Task 2.3: Verify `json-store` write serialization (no mutex needed for v1)

**Files:**
- Read-only inspection: `apps/api/src/shared/providers/json-store.ts`

- [ ] **Step 1: Read the file and confirm**

The current implementation writes via `tmp + rename`. Last-write-wins under concurrency. For single-user/single-process (per PRODUCT.md) this is acceptable; the only realistic concurrency for descriptions is "user clicks Save twice fast", and the second click overwrites the first deterministically.

**No code change.** If a future bug appears, add a per-path mutex (the simplest version is a `Map<string, Promise<void>>` chained on `write`).

- [ ] **Step 2: Note in commit message**

When committing Phase 2, mention "json-store unchanged; single-process write semantics deemed sufficient".

## Task 2.4: Update `fakeCategoriesRepo` to match the new contract — test refactor

**Files:**
- Modify: `apps/api/src/shared/testing/fakes.ts`

- [ ] **Step 1: Rewrite `fakeCategoriesRepo`**

Accept either the legacy `string[]` (sugar — converts to `{name,description:''}`) or the new `CustomCategoryDefinition[]` shape:

```ts
export function fakeCategoriesRepo(
  seed: ReadonlyArray<string | CustomCategoryDefinition> = [],
): CategoriesRepository {
  let data: CustomCategoryDefinition[] = seed.map((entry) =>
    typeof entry === 'string' ? { name: entry, description: '' } : { ...entry },
  );
  return {
    async all() { return data.map((c) => ({ ...c })); },
    async add(name, description) {
      if (!data.some((c) => c.name === name)) data.push({ name, description });
    },
    async remove(name) { data = data.filter((c) => c.name !== name); },
    async rename(from, to) {
      data = data.map((c) => (c.name === from ? { name: to, description: c.description } : c));
    },
    async setDescription(name, description) {
      if (!data.some((c) => c.name === name)) return;
      data = data.map((c) => (c.name === name ? { name: c.name, description } : c));
    },
  };
}
```

Add the import at the top if missing: `import type { CustomCategoryDefinition } from '../domain/custom-categories';`

- [ ] **Step 2: Run all api tests to find what broke**

```bash
cd apps/api && bun test 2>&1 | tail -40
```

Expected: existing tests using `fakeCategoriesRepo(['mascotas'])` still pass (sugar path). Tests that asserted `repo.all()` returned `['mascotas']` fail with `[{name:'mascotas',description:''}]`. Fix those assertions inline (in the existing test files). The list is:
- `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts` (multiple assertions)

For each `expect(await repo.all()).toEqual(['mascotas'])` change to `expect(await repo.all()).toEqual([{ name: 'mascotas', description: '' }])`. Mirror for any other string-array assertion.

- [ ] **Step 3: Run all api tests again**

```bash
cd apps/api && bun test 2>&1 | tail -20
```

Expected: PASS. No new test introduced here; the goal is to keep the existing 76 baseline green.

## Task 2.5: Implement `JsonDefaultCategoryOverridesRepository` — test first

**Files:**
- Test: `apps/api/src/categorization/repositories/json-default-category-overrides.repository.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, beforeEach } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonDefaultCategoryOverridesRepository } from './json-default-category-overrides.repository';

let dir: string;
let file: string;
let repo: JsonDefaultCategoryOverridesRepository;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'def-cat-'));
  file = path.join(dir, 'default-category-overrides.json');
  repo = new JsonDefaultCategoryOverridesRepository(file);
});

test('all returns {} when the file does not exist', async () => {
  expect(await repo.all()).toEqual({});
});

test('set persists a value', async () => {
  await repo.set('comida', 'solo restaurantes, no super');
  expect(await repo.all()).toEqual({ comida: 'solo restaurantes, no super' });
});

test('set overwrites an existing value', async () => {
  await repo.set('comida', 'a');
  await repo.set('comida', 'b');
  expect(await repo.all()).toEqual({ comida: 'b' });
});

test('reset removes a key', async () => {
  await repo.set('comida', 'algo');
  await repo.reset('comida');
  expect(await repo.all()).toEqual({});
});

test('reset on missing key is a no-op', async () => {
  await repo.reset('comida');
  expect(await repo.all()).toEqual({});
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api && bun test src/categorization/repositories/json-default-category-overrides.repository.test.ts
```

Expected: FAIL — module does not exist.

## Task 2.6: Implement `JsonDefaultCategoryOverridesRepository`

**Files:**
- Create: `apps/api/src/categorization/repositories/json-default-category-overrides.repository.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type {
  DefaultCategoryOverrides,
  DefaultCategoryOverridesRepository,
} from '../../shared/domain/default-category-overrides';

@Injectable()
export class JsonDefaultCategoryOverridesRepository implements DefaultCategoryOverridesRepository {
  private readonly store: JsonStore<DefaultCategoryOverrides>;

  constructor(filePath?: string) {
    this.store = createJsonStore<DefaultCategoryOverrides>(
      filePath ?? path.join(DATA_DIR, 'default-category-overrides.json'),
      {},
    );
  }

  all(): Promise<DefaultCategoryOverrides> {
    return this.store.read();
  }

  async set(name: string, description: string): Promise<void> {
    const data = await this.store.read();
    data[name] = description;
    await this.store.write(data);
  }

  async reset(name: string): Promise<void> {
    const data = await this.store.read();
    if (!(name in data)) return;
    delete data[name];
    await this.store.write(data);
  }
}
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api && bun test src/categorization/repositories/json-default-category-overrides.repository.test.ts
```

Expected: PASS (5 cases).

## Task 2.7: Add `fakeDefaultCategoryOverridesRepo` to test fakes

**Files:**
- Modify: `apps/api/src/shared/testing/fakes.ts`

- [ ] **Step 1: Append the helper**

```ts
import type {
  DefaultCategoryOverrides,
  DefaultCategoryOverridesRepository,
} from '../domain/default-category-overrides';

export function fakeDefaultCategoryOverridesRepo(
  seed: DefaultCategoryOverrides = {},
): DefaultCategoryOverridesRepository {
  const data: DefaultCategoryOverrides = { ...seed };
  return {
    async all() { return { ...data }; },
    async set(name, description) { data[name] = description; },
    async reset(name) { delete data[name]; },
  };
}
```

- [ ] **Step 2: Build check**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 2.8: Implement `CategoryDescriptionResolver` — test first

**Files:**
- Test: `apps/api/src/shared/providers/category-description-resolver.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from 'bun:test';
import { CategoryDescriptionResolver } from './category-description-resolver';
import { CategoryRegistry } from './category-registry';
import { DomainError } from '../domain/domain-error';
import { fakeCategoriesRepo, fakeDefaultCategoryOverridesRepo } from '../testing/fakes';

function make(opts: {
  customs?: Array<string | { name: string; description: string }>;
  overrides?: Record<string, string>;
} = {}) {
  const customsRepo = fakeCategoriesRepo(opts.customs ?? []);
  const defaultsRepo = fakeDefaultCategoryOverridesRepo(opts.overrides ?? {});
  const registry = new CategoryRegistry(customsRepo);
  return new CategoryDescriptionResolver(customsRepo, defaultsRepo, registry);
}

test('resolve returns the seed for a default with no override', async () => {
  const r = make();
  const d = await r.resolve('comida');
  expect(d).toContain('Restaurantes');
});

test('resolve returns the override for a default that has one', async () => {
  const r = make({ overrides: { comida: 'solo restaurantes' } });
  expect(await r.resolve('comida')).toBe('solo restaurantes');
});

test('resolve returns the custom description', async () => {
  const r = make({ customs: [{ name: 'mascotas', description: 'gatos y perros' }] });
  expect(await r.resolve('mascotas')).toBe('gatos y perros');
});

test('resolve returns "" for a custom with empty description', async () => {
  const r = make({ customs: ['mascotas'] });
  expect(await r.resolve('mascotas')).toBe('');
});

test('resolve throws NOT_FOUND for an unknown name', async () => {
  const r = make();
  await expect(r.resolve('inexistente')).rejects.toThrow(DomainError);
});

test('resolveAll lists defaults first then customs', async () => {
  const r = make({
    customs: [{ name: 'mascotas', description: 'gatos' }],
    overrides: { comida: 'solo restaurantes' },
  });
  const all = await r.resolveAll();
  expect(all.length).toBe(8);
  expect(all[0]).toEqual({ name: 'comida', description: 'solo restaurantes', isCustom: false });
  expect(all[6]).toEqual({ name: 'otros', description: expect.any(String), isCustom: false });
  expect(all[7]).toEqual({ name: 'mascotas', description: 'gatos', isCustom: true });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api && bun test src/shared/providers/category-description-resolver.test.ts
```

Expected: FAIL — module does not exist.

## Task 2.9: Implement `CategoryDescriptionResolver`

**Files:**
- Create: `apps/api/src/shared/providers/category-description-resolver.ts`

- [ ] **Step 1: Write the file**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORIES } from '../domain/category';
import { DomainError } from '../domain/domain-error';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../domain/custom-categories';
import {
  DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
  type DefaultCategoryOverridesRepository,
} from '../domain/default-category-overrides';
import { CategoryRegistry } from './category-registry';

export interface ResolvedCategory {
  readonly name: string;
  readonly description: string;
  readonly isCustom: boolean;
}

/**
 * Effective description for a category: user override > seed (for defaults) /
 * stored description (for customs) > '' (custom with no description).
 */
@Injectable()
export class CategoryDescriptionResolver {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly customs: CategoriesRepository,
    @Inject(DEFAULT_CATEGORY_OVERRIDES_REPOSITORY) private readonly defaults: DefaultCategoryOverridesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async resolve(name: string): Promise<string> {
    if (!(await this.registry.exists(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    if (this.registry.isDefault(name)) {
      const overrides = await this.defaults.all();
      if (name in overrides) return overrides[name];
      return DEFAULT_CATEGORIES.find((c) => c.name === name)!.description;
    }
    const all = await this.customs.all();
    return all.find((c) => c.name === name)?.description ?? '';
  }

  async resolveAll(): Promise<ResolvedCategory[]> {
    const [overrides, customs] = await Promise.all([this.defaults.all(), this.customs.all()]);
    const defaults: ResolvedCategory[] = DEFAULT_CATEGORIES.map((c) => ({
      name: c.name,
      description: overrides[c.name] ?? c.description,
      isCustom: false,
    }));
    const customList: ResolvedCategory[] = customs.map((c) => ({
      name: c.name,
      description: c.description,
      isCustom: true,
    }));
    return [...defaults, ...customList];
  }
}
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api && bun test src/shared/providers/category-description-resolver.test.ts
```

Expected: PASS (6 cases).

## Task 2.10: Wire new providers in `categorization.module.ts`

**Files:**
- Modify: `apps/api/src/categorization/categorization.module.ts`

- [ ] **Step 1: Add the bindings**

```ts
import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { OverrideMerchantCategory } from './use-cases/override-merchant.use-case';
import { OverrideTransactionCategory } from './use-cases/override-transaction.use-case';
import { CreateCategory } from './use-cases/create-category.use-case';
import { RenameCategory } from './use-cases/rename-category.use-case';
import { DeleteCategory } from './use-cases/delete-category.use-case';
import { ListCategories } from './use-cases/list-categories.use-case';
import { ProposeCategoryChange } from './use-cases/propose-category-change.use-case';
import { CategorizationController } from './interface/categorization.controller';
import { JsonDefaultCategoryOverridesRepository } from './repositories/json-default-category-overrides.repository';
import { DEFAULT_CATEGORY_OVERRIDES_REPOSITORY } from '../shared/domain/default-category-overrides';
import { CategoryDescriptionResolver } from '../shared/providers/category-description-resolver';

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
    ProposeCategoryChange,
    CategoryDescriptionResolver,
    { provide: DEFAULT_CATEGORY_OVERRIDES_REPOSITORY, useClass: JsonDefaultCategoryOverridesRepository },
  ],
  exports: [CategoryDescriptionResolver, DEFAULT_CATEGORY_OVERRIDES_REPOSITORY],
})
export class CategorizationModule {}
```

- [ ] **Step 2: Build**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 2.11: Commit Phase 2

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/api && bun test 2>&1 | tail -10
```

Expected: PASS (baseline 76 + new tests).

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/categorization/repositories/json-categories.repository.ts \
        apps/api/src/categorization/repositories/json-categories.repository.test.ts \
        apps/api/src/categorization/repositories/json-default-category-overrides.repository.ts \
        apps/api/src/categorization/repositories/json-default-category-overrides.repository.test.ts \
        apps/api/src/shared/providers/category-description-resolver.ts \
        apps/api/src/shared/providers/category-description-resolver.test.ts \
        apps/api/src/shared/testing/fakes.ts \
        apps/api/src/categorization/categorization.module.ts \
        apps/api/src/categorization/use-cases/category-management.use-cases.test.ts

git commit -m "feat(api): persist category descriptions with lazy migration"
```

---

# Phase 3 — Use-cases nuevos + extendidos

## Task 3.1: `UpdateCategoryDescription` — test first

**Files:**
- Test: `apps/api/src/categorization/use-cases/update-category-description.use-case.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from 'bun:test';
import { UpdateCategoryDescription } from './update-category-description.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo, fakeDefaultCategoryOverridesRepo } from '../../shared/testing/fakes';

function make(opts: {
  customs?: Array<string | { name: string; description: string }>;
  overrides?: Record<string, string>;
} = {}) {
  const customs = fakeCategoriesRepo(opts.customs ?? []);
  const defaults = fakeDefaultCategoryOverridesRepo(opts.overrides ?? {});
  const registry = new CategoryRegistry(customs);
  return { useCase: new UpdateCategoryDescription(customs, defaults, registry), customs, defaults };
}

test('updates the override for a default category', async () => {
  const { useCase, defaults } = make();
  const result = await useCase.execute({ name: 'comida', description: '  solo restaurantes  ' });
  expect(result).toEqual({ name: 'comida', description: 'solo restaurantes' });
  expect(await defaults.all()).toEqual({ comida: 'solo restaurantes' });
});

test('updates the description for a custom category', async () => {
  const { useCase, customs } = make({ customs: ['mascotas'] });
  const result = await useCase.execute({ name: 'mascotas', description: 'gatos y perros' });
  expect(result).toEqual({ name: 'mascotas', description: 'gatos y perros' });
  expect(await customs.all()).toEqual([{ name: 'mascotas', description: 'gatos y perros' }]);
});

test('accepts an empty description (clears it)', async () => {
  const { useCase, customs } = make({ customs: [{ name: 'mascotas', description: 'algo' }] });
  await useCase.execute({ name: 'mascotas', description: '' });
  expect((await customs.all())[0].description).toBe('');
});

test('rejects a description longer than 240 chars', async () => {
  const { useCase } = make();
  await expect(useCase.execute({ name: 'comida', description: 'x'.repeat(241) })).rejects.toThrow(DomainError);
});

test('rejects an unknown category', async () => {
  const { useCase } = make();
  await expect(useCase.execute({ name: 'inexistente', description: 'a' })).rejects.toThrow(DomainError);
});

test('normalizes the category name', async () => {
  const { useCase, defaults } = make();
  await useCase.execute({ name: '  Comida ', description: 'x' });
  expect(await defaults.all()).toEqual({ comida: 'x' });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api && bun test src/categorization/use-cases/update-category-description.use-case.test.ts
```

Expected: FAIL — module does not exist.

## Task 3.2: Implement `UpdateCategoryDescription`

**Files:**
- Create: `apps/api/src/categorization/use-cases/update-category-description.use-case.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import {
  DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
  type DefaultCategoryOverridesRepository,
} from '../../shared/domain/default-category-overrides';
import { normalizeCategoryName } from '../providers/category-name';

const MAX_DESCRIPTION_LENGTH = 240;

export interface UpdateCategoryDescriptionInput {
  name: string;
  description: string;
}
export interface UpdateCategoryDescriptionResult {
  name: string;
  description: string;
}

@Injectable()
export class UpdateCategoryDescription {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly customs: CategoriesRepository,
    @Inject(DEFAULT_CATEGORY_OVERRIDES_REPOSITORY) private readonly defaults: DefaultCategoryOverridesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: UpdateCategoryDescriptionInput): Promise<UpdateCategoryDescriptionResult> {
    const name = normalizeCategoryName(input.name);
    const description = input.description.trim();
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new DomainError('VALIDATION_ERROR', `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`);
    }
    if (!(await this.registry.exists(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    if (this.registry.isDefault(name)) {
      await this.defaults.set(name, description);
    } else {
      await this.customs.setDescription(name, description);
    }
    return { name, description };
  }
}
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api && bun test src/categorization/use-cases/update-category-description.use-case.test.ts
```

Expected: PASS (6 cases).

## Task 3.3: `ResetCategoryDescription` — test first

**Files:**
- Test: `apps/api/src/categorization/use-cases/reset-category-description.use-case.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from 'bun:test';
import { ResetCategoryDescription } from './reset-category-description.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo, fakeDefaultCategoryOverridesRepo } from '../../shared/testing/fakes';

function make(opts: {
  customs?: Array<string | { name: string; description: string }>;
  overrides?: Record<string, string>;
} = {}) {
  const customs = fakeCategoriesRepo(opts.customs ?? []);
  const defaults = fakeDefaultCategoryOverridesRepo(opts.overrides ?? {});
  const registry = new CategoryRegistry(customs);
  return { useCase: new ResetCategoryDescription(defaults, registry), customs, defaults };
}

test('removes the override and returns the seed', async () => {
  const { useCase, defaults } = make({ overrides: { comida: 'algo' } });
  const result = await useCase.execute({ name: 'comida' });
  expect(result.name).toBe('comida');
  expect(result.description).toContain('Restaurantes');
  expect(await defaults.all()).toEqual({});
});

test('no-op when the default has no override (returns the seed)', async () => {
  const { useCase } = make();
  const result = await useCase.execute({ name: 'comida' });
  expect(result.description).toContain('Restaurantes');
});

test('rejects a custom category', async () => {
  const { useCase } = make({ customs: ['mascotas'] });
  await expect(useCase.execute({ name: 'mascotas' })).rejects.toThrow(DomainError);
});

test('rejects an unknown name', async () => {
  const { useCase } = make();
  await expect(useCase.execute({ name: 'inexistente' })).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api && bun test src/categorization/use-cases/reset-category-description.use-case.test.ts
```

Expected: FAIL — module does not exist.

## Task 3.4: Implement `ResetCategoryDescription`

**Files:**
- Create: `apps/api/src/categorization/use-cases/reset-category-description.use-case.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DEFAULT_CATEGORIES } from '../../shared/domain/category';
import {
  DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
  type DefaultCategoryOverridesRepository,
} from '../../shared/domain/default-category-overrides';
import { normalizeCategoryName } from '../providers/category-name';

export interface ResetCategoryDescriptionInput { name: string; }
export interface ResetCategoryDescriptionResult { name: string; description: string; }

@Injectable()
export class ResetCategoryDescription {
  constructor(
    @Inject(DEFAULT_CATEGORY_OVERRIDES_REPOSITORY) private readonly defaults: DefaultCategoryOverridesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: ResetCategoryDescriptionInput): Promise<ResetCategoryDescriptionResult> {
    const name = normalizeCategoryName(input.name);
    if (!(await this.registry.exists(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    if (!this.registry.isDefault(name)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Solo las categorías default pueden volver al texto original. Para limpiar una custom, usá updateCategoryDescription con descripción vacía.',
      );
    }
    await this.defaults.reset(name);
    const seed = DEFAULT_CATEGORIES.find((c) => c.name === name)!.description;
    return { name, description: seed };
  }
}
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api && bun test src/categorization/use-cases/reset-category-description.use-case.test.ts
```

Expected: PASS (4 cases).

## Task 3.5: Extend `CreateCategory` to accept `description?`

**Files:**
- Modify: `apps/api/src/categorization/use-cases/create-category.use-case.ts`
- Modify: `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts` (extend)

- [ ] **Step 1: Add a failing test in `category-management.use-cases.test.ts`**

Append:

```ts
test('create-category accepts an optional description', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await useCase.execute({ name: 'mascotas', description: 'gatos y perros' });
  expect(await repo.all()).toEqual([{ name: 'mascotas', description: 'gatos y perros' }]);
});

test('create-category defaults description to empty string', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await useCase.execute({ name: 'mascotas' });
  expect(await repo.all()).toEqual([{ name: 'mascotas', description: '' }]);
});

test('create-category rejects an over-long description', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await expect(useCase.execute({ name: 'mascotas', description: 'x'.repeat(241) })).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts
```

Expected: FAIL on the first new case (description not stored).

- [ ] **Step 3: Update the use-case**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import { normalizeCategoryName } from '../providers/category-name';

const MAX_DESCRIPTION_LENGTH = 240;

export interface CreateCategoryInput {
  name: string;
  description?: string;
}
export interface CreateCategoryResult {
  name: string;
  description: string;
}

@Injectable()
export class CreateCategory {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: CreateCategoryInput): Promise<CreateCategoryResult> {
    const name = normalizeCategoryName(input.name);
    const description = (input.description ?? '').trim();
    if (name.length === 0 || name.length > 24) {
      throw new DomainError('VALIDATION_ERROR', 'El nombre de la categoría debe tener entre 1 y 24 caracteres.');
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new DomainError('VALIDATION_ERROR', `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`);
    }
    if (await this.registry.exists(name)) {
      throw new DomainError('VALIDATION_ERROR', `La categoría "${name}" ya existe.`);
    }
    await this.repo.add(name, description);
    return { name, description };
  }
}
```

- [ ] **Step 4: Update the original `create-category normalizes the name and persists it` assertion**

Old expected `{ name: 'mascotas' }`. New: `{ name: 'mascotas', description: '' }`. Apply.

- [ ] **Step 5: Run the test file**

```bash
cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts
```

Expected: PASS.

## Task 3.6: Extend `ListCategories` to return descriptions

**Files:**
- Modify: `apps/api/src/categorization/use-cases/list-categories.use-case.ts`
- Modify: `apps/api/src/categorization/use-cases/category-management.use-cases.test.ts` (extend existing list test if any, or add)

- [ ] **Step 1: Add a failing test**

Append to `category-management.use-cases.test.ts`:

```ts
import { CategoryDescriptionResolver } from '../../shared/providers/category-description-resolver';

test('list-categories returns name, isCustom and description', async () => {
  const customs = fakeCategoriesRepo([{ name: 'mascotas', description: 'gatos' }]);
  const defaults = fakeDefaultCategoryOverridesRepo({ comida: 'solo restaurantes' });
  const registry = new CategoryRegistry(customs);
  const resolver = new CategoryDescriptionResolver(customs, defaults, registry);
  const useCase = new ListCategories(customs, registry, resolver);

  const { categories } = await useCase.execute();
  const comida = categories.find((c) => c.name === 'comida')!;
  const mascotas = categories.find((c) => c.name === 'mascotas')!;

  expect(comida).toEqual({ name: 'comida', isCustom: false, description: 'solo restaurantes' });
  expect(mascotas).toEqual({ name: 'mascotas', isCustom: true, description: 'gatos' });
});
```

(Also add the import: `import { fakeDefaultCategoryOverridesRepo } from '../../shared/testing/fakes';` and `import { ListCategories } from './list-categories.use-case';` if not already.)

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/api && bun test src/categorization/use-cases/category-management.use-cases.test.ts
```

Expected: FAIL (resolver not in `ListCategories` constructor; output missing `description`).

- [ ] **Step 3: Update `ListCategories`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryDescriptionResolver } from '../../shared/providers/category-description-resolver';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';

export interface CategoryListing {
  name: string;
  isCustom: boolean;
  description: string;
}
export interface ListCategoriesResult {
  categories: CategoryListing[];
}

@Injectable()
export class ListCategories {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    private readonly registry: CategoryRegistry,
    private readonly resolver: CategoryDescriptionResolver,
  ) {}

  async execute(): Promise<ListCategoriesResult> {
    const resolved = await this.resolver.resolveAll();
    return {
      categories: resolved.map((c) => ({ name: c.name, isCustom: c.isCustom, description: c.description })),
    };
  }
}
```

- [ ] **Step 4: Run all api tests**

```bash
cd apps/api && bun test 2>&1 | tail -10
```

Expected: PASS.

## Task 3.7: Wire new use-cases into `categorization.module.ts`

**Files:**
- Modify: `apps/api/src/categorization/categorization.module.ts`

- [ ] **Step 1: Add providers**

```ts
import { UpdateCategoryDescription } from './use-cases/update-category-description.use-case';
import { ResetCategoryDescription } from './use-cases/reset-category-description.use-case';

// inside providers array:
UpdateCategoryDescription,
ResetCategoryDescription,
```

- [ ] **Step 2: Build**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 3.8: Commit Phase 3

```bash
git add apps/api/src/categorization/use-cases/update-category-description.use-case.ts \
        apps/api/src/categorization/use-cases/update-category-description.use-case.test.ts \
        apps/api/src/categorization/use-cases/reset-category-description.use-case.ts \
        apps/api/src/categorization/use-cases/reset-category-description.use-case.test.ts \
        apps/api/src/categorization/use-cases/create-category.use-case.ts \
        apps/api/src/categorization/use-cases/list-categories.use-case.ts \
        apps/api/src/categorization/use-cases/category-management.use-cases.test.ts \
        apps/api/src/categorization/categorization.module.ts

git commit -m "feat(api): use-cases for category descriptions"
```

---

# Phase 4 — HTTP endpoints

## Task 4.1: Add Zod schemas for the new endpoints

**Files:**
- Modify: `apps/api/src/categorization/interface/categorization.schemas.ts`

- [ ] **Step 1: Append**

```ts
export const updateCategoryDescriptionInput = z.object({
  name: z.string().min(1),
  description: z.string().max(240),
});

export const resetCategoryDescriptionInput = z.object({
  name: z.string().min(1),
});
```

Also extend `createCategoryInput`:

```ts
export const createCategoryInput = z.object({
  name: z.string().min(1).max(24),
  description: z.string().max(240).optional(),
});
```

- [ ] **Step 2: Build**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 4.2: Add the two new controller endpoints

**Files:**
- Modify: `apps/api/src/categorization/interface/categorization.controller.ts`

- [ ] **Step 1: Edit the controller**

Add imports:

```ts
import { UpdateCategoryDescription, type UpdateCategoryDescriptionInput } from '../use-cases/update-category-description.use-case';
import { ResetCategoryDescription, type ResetCategoryDescriptionInput } from '../use-cases/reset-category-description.use-case';
import { updateCategoryDescriptionInput, resetCategoryDescriptionInput } from './categorization.schemas';
```

Add to the constructor: `private readonly updateDesc: UpdateCategoryDescription, private readonly resetDesc: ResetCategoryDescription,`.

Add the two endpoints:

```ts
@Post('update-description')
updateDescription(@Body(new ZodValidationPipe(updateCategoryDescriptionInput)) body: UpdateCategoryDescriptionInput) {
  return this.updateDesc.execute(body);
}

@Post('reset-description')
resetDescription(@Body(new ZodValidationPipe(resetCategoryDescriptionInput)) body: ResetCategoryDescriptionInput) {
  return this.resetDesc.execute(body);
}
```

- [ ] **Step 2: Build**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 4.3: Manual smoke test of endpoints

- [ ] **Step 1: Start the API**

In one terminal:

```bash
cd apps/api && bun dev
```

Expected: server up at `http://localhost:3001`.

- [ ] **Step 2: Update a description**

```bash
curl -s -X POST http://localhost:3001/categorization/update-description \
  -H 'content-type: application/json' \
  -d '{"name":"comida","description":"solo restaurantes, no super"}'
```

Expected: `{"name":"comida","description":"solo restaurantes, no super"}`.

- [ ] **Step 3: List**

```bash
curl -s -X POST http://localhost:3001/categorization/list-categories -H 'content-type: application/json' -d '{}'
```

Expected: `comida` shows `description: "solo restaurantes, no super"`.

- [ ] **Step 4: Reset**

```bash
curl -s -X POST http://localhost:3001/categorization/reset-description -H 'content-type: application/json' -d '{"name":"comida"}'
```

Expected: response with the seed description (contains "Restaurantes").

- [ ] **Step 5: Stop the server (Ctrl+C)**

## Task 4.4: Commit Phase 4

```bash
git add apps/api/src/categorization/interface/categorization.controller.ts \
        apps/api/src/categorization/interface/categorization.schemas.ts

git commit -m "feat(api): HTTP endpoints for category descriptions"
```

---

# Phase 5 — Mastra workflow (cherry-pick + generalize)

## Task 5.1: Cherry-pick classifier files from MP worktree

- [ ] **Step 1: Bring files in (do NOT touch yet)**

```bash
mkdir -p apps/ai/src/categorization/agents apps/ai/src/categorization/workflows

git checkout worktree-proactive-mercadopago -- apps/ai/src/mp-classification/agents/mp-classifier.agent.ts
git checkout worktree-proactive-mercadopago -- apps/ai/src/mp-classification/workflows/classify-mp-event.workflow.ts
git checkout worktree-proactive-mercadopago -- apps/ai/src/mp-classification/domain/classification.ts

mv apps/ai/src/mp-classification/agents/mp-classifier.agent.ts apps/ai/src/categorization/agents/transaction-classifier.agent.ts
mv apps/ai/src/mp-classification/workflows/classify-mp-event.workflow.ts apps/ai/src/categorization/workflows/classify-transaction.workflow.ts
mv apps/ai/src/mp-classification/domain/classification.ts apps/ai/src/categorization/domain/classification.ts

rm -r apps/ai/src/mp-classification
```

- [ ] **Step 2: Confirm the three files moved**

```bash
ls apps/ai/src/categorization/agents apps/ai/src/categorization/workflows apps/ai/src/categorization/domain
```

Expected: shows `transaction-classifier.agent.ts`, `classify-transaction.workflow.ts`, and `classification.ts` (alongside the existing `categorization.gateway.ts`).

## Task 5.2: Rewrite `apps/ai/src/categorization/domain/classification.ts` for the general contract

- [ ] **Step 1: Replace contents**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const classifyTransactionInput = z.object({
  merchant: z.string().min(1),
  description: z.string().nullable(),
  amount: z.number().positive(),
  direction: z.enum(['expense', 'income']).default('expense'),
  /** The user's category set with descriptions — the source of truth for the model. */
  categories: z.array(z.object({
    name: z.string().min(1),
    description: z.string(),
  })).min(1),
});

export const classificationResult = z.object({
  category: categorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(160).optional(),
});

export type ClassifyTransactionInput = z.infer<typeof classifyTransactionInput>;
export type ClassificationResult = z.infer<typeof classificationResult>;
```

## Task 5.3: Rewrite the agent instructions

**Files:**
- Modify: `apps/ai/src/categorization/agents/transaction-classifier.agent.ts`

- [ ] **Step 1: Replace contents**

```ts
import { Agent } from '@mastra/core/agent';

/**
 * The classifier agent used by the `classify-transaction` workflow. It has no
 * injected dependencies; the category list (with descriptions) is supplied as
 * input data each call, not baked into the prompt.
 */
export const transactionClassifierAgent = new Agent({
  id: 'transaction-classifier',
  name: 'Transaction Classifier',
  model: 'openai/gpt-4o',
  instructions: `You classify a single Argentine personal-finance transaction.

You receive the list of available categories with a short description of what
each one contains. Use ONLY those descriptions to decide — do not rely on prior
knowledge of what "comida" or "transporte" usually means. The user's description
is the source of truth.

Pick exactly one category from the provided list. If nothing fits, pick "otros"
with low confidence — do not invent a category name that is not in the list.

Report:
- category: one of the provided category names (exact match, case-sensitive).
- confidence: 0..1, how sure you are. Use < 0.4 when the merchant is unknown or
  the description is genuinely ambiguous across two categories. Use > 0.8 when
  the merchant clearly matches one of the descriptions.
- reasoning (optional, max 160 chars, Spanish): a one-line trace of the cue that
  led you to the category. For debugging.`,
});
```

## Task 5.4: Rewrite the workflow

**Files:**
- Modify: `apps/ai/src/categorization/workflows/classify-transaction.workflow.ts`

- [ ] **Step 1: Replace contents**

```ts
/**
 * Transaction classifier — apps/ai's first generalized classification workflow.
 *
 * Registered in `src/mastra/index.ts` under the key `classifyTransaction`. Mastra
 * exposes it at:
 *
 *   POST /api/workflows/classify-transaction/start-async
 *
 * Request body:
 *   {
 *     "inputData": {
 *       "merchant": string,
 *       "description": string | null,
 *       "amount": number,        // positive
 *       "direction": "expense" | "income",
 *       "categories": [{ "name": string, "description": string }, ...]
 *     }
 *   }
 *
 * Response body (status "success"):
 *   {
 *     "status": "success",
 *     "result": {
 *       "category": string,           // one of the supplied category names
 *       "confidence": number,         // 0..1
 *       "reasoning": string?          // optional, Spanish, max 160 chars
 *     }
 *   }
 */
import { toStandardSchema } from '@mastra/core/schema';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { classifyTransactionInput, classificationResult } from '../domain/classification';
import { transactionClassifierAgent } from '../agents/transaction-classifier.agent';

const buildPrompt = createStep({
  id: 'build-classification-prompt',
  inputSchema: classifyTransactionInput,
  outputSchema: z.object({ prompt: z.string() }),
  execute: async ({ inputData }) => ({
    prompt: [
      'CATEGORIES (use these descriptions as the source of truth):',
      ...inputData.categories.map((c) => `- ${c.name}: ${c.description || '(sin descripción)'}`),
      '',
      'TRANSACTION:',
      `Direction: ${inputData.direction === 'income' ? 'cobro entrante' : 'pago saliente'}`,
      `Amount: ARS ${inputData.amount}`,
      `Merchant: ${inputData.merchant}`,
      `Description: ${inputData.description ?? '(none)'}`,
    ].join('\n'),
  }),
});

const classifyStep = createStep(transactionClassifierAgent, {
  structuredOutput: { schema: toStandardSchema(classificationResult) },
});

export const classifyTransactionWorkflow = createWorkflow({
  id: 'classify-transaction',
  inputSchema: classifyTransactionInput,
  outputSchema: classificationResult,
})
  .then(buildPrompt)
  .then(classifyStep)
  .commit();
```

## Task 5.5: Register the workflow in Mastra

**Files:**
- Modify: `apps/ai/src/mastra/index.ts`

- [ ] **Step 1: Add the import and register**

Add import: `import { classifyTransactionWorkflow } from '../categorization/workflows/classify-transaction.workflow';`

In the `new Mastra({...})` call, add a top-level `workflows` field:

```ts
export const mastra = new Mastra({
  agents: { gasti },
  workflows: { classifyTransaction: classifyTransactionWorkflow },
  storage: buildMastraStorage(),
  server: { /* middleware unchanged for now */ },
});
```

(Phase 8 will rewrite the middleware to set `categoriesWithDescriptions`.)

- [ ] **Step 2: Build**

```bash
cd apps/ai && bun run build
```

Expected: PASS.

## Task 5.6: Manual smoke test of the workflow

- [ ] **Step 1: Start Mastra dev server**

```bash
cd apps/ai && bun dev
```

Wait for "Mastra is running on port 4111" (per memory note: bind port 4111).

- [ ] **Step 2: Call the workflow**

```bash
curl -s -X POST http://localhost:4111/api/workflows/classify-transaction/start-async \
  -H 'content-type: application/json' \
  -d '{
    "inputData": {
      "merchant": "Rappi",
      "description": "pedido del lunes",
      "amount": 8500,
      "direction": "expense",
      "categories": [
        { "name": "comida", "description": "Restaurantes, delivery, supermercados" },
        { "name": "transporte", "description": "Uber, colectivo, SUBE" },
        { "name": "otros", "description": "Catch-all" }
      ]
    }
  }'
```

Expected: response with `status: "success"`, `result: { category: "comida", confidence: > 0.7, reasoning?: "..." }`.

- [ ] **Step 3: Stop the server (Ctrl+C)**

## Task 5.7: Commit Phase 5

```bash
git add apps/ai/src/categorization/agents/transaction-classifier.agent.ts \
        apps/ai/src/categorization/workflows/classify-transaction.workflow.ts \
        apps/ai/src/categorization/domain/classification.ts \
        apps/ai/src/mastra/index.ts

git commit -m "feat(ai): generalize MP classifier into classify-transaction workflow"
```

---

# Phase 6 — Mastra gateway + tools for the new endpoints

## Task 6.1: Extend the gateway schemas

**Files:**
- Modify: `apps/ai/src/categorization/domain/categorization.gateway.ts`

- [ ] **Step 1: Append schemas and gateway methods**

After the existing schemas, add:

```ts
export const updateCategoryDescriptionInput = z.object({
  name: z.string().min(1),
  description: z.string().max(240),
});
export const updateCategoryDescriptionResult = z.object({
  name: z.string(),
  description: z.string(),
});

export const resetCategoryDescriptionInput = z.object({ name: z.string().min(1) });
export const resetCategoryDescriptionResult = z.object({ name: z.string(), description: z.string() });

export type UpdateCategoryDescriptionInput = z.infer<typeof updateCategoryDescriptionInput>;
export type UpdateCategoryDescriptionResult = z.infer<typeof updateCategoryDescriptionResult>;
export type ResetCategoryDescriptionInput = z.infer<typeof resetCategoryDescriptionInput>;
export type ResetCategoryDescriptionResult = z.infer<typeof resetCategoryDescriptionResult>;
```

Extend `listCategoriesResult`:

```ts
export const listCategoriesResult = z.object({
  categories: z.array(z.object({
    name: z.string(),
    isCustom: z.boolean(),
    description: z.string(),
  })),
});
```

Extend `createCategoryInput`:

```ts
export const createCategoryInput = z.object({
  name: z.string().min(1).max(24),
  description: z.string().max(240).optional(),
});
export const createCategoryResult = z.object({ name: z.string(), description: z.string() });
```

Extend the `CategorizationGateway` interface:

```ts
export interface CategorizationGateway {
  // ...existing methods...
  updateDescription(input: UpdateCategoryDescriptionInput, ctx: GatewayCtx): Promise<UpdateCategoryDescriptionResult>;
  resetDescription(input: ResetCategoryDescriptionInput, ctx: GatewayCtx): Promise<ResetCategoryDescriptionResult>;
}
```

- [ ] **Step 2: Build**

```bash
cd apps/ai && bun run build
```

Expected: build fails on `http-categorization.gateway.ts` (interface mismatch) — fix in 6.2.

## Task 6.2: Map the new routes in the HTTP gateway

**Files:**
- Modify: `apps/ai/src/categorization/providers/http-categorization.gateway.ts`

- [ ] **Step 1: Add the new entries**

```ts
return makeHttpGateway<CategorizationGateway>(api, {
  overrideMerchant: '/categorization/merchant',
  overrideTransaction: '/categorization/transaction',
  create: '/categorization/create-category',
  rename: '/categorization/rename-category',
  remove: '/categorization/delete-category',
  list: '/categorization/list-categories',
  propose: '/categorization/propose-category-change',
  updateDescription: '/categorization/update-description',
  resetDescription: '/categorization/reset-description',
});
```

- [ ] **Step 2: Build**

```bash
cd apps/ai && bun run build
```

Expected: PASS.

## Task 6.3: Expose the new tools

**Files:**
- Modify: `apps/ai/src/categorization/interface/categorization.tools.ts`

- [ ] **Step 1: Add to the returned object**

```ts
import * as s from '../domain/categorization.gateway';

updateCategoryDescription: createGatewayTool({
  id: 'updateCategoryDescription',
  description:
    'Set or update the semantic description of a category — the text the classifier uses to decide what fits. Non-destructive, no confirmation needed. Use when the user says things like "comida es solo restaurantes, no super" or "agregale a transporte que incluye peajes". Empty description is allowed (clears it).',
  inputSchema: s.updateCategoryDescriptionInput,
  outputSchema: s.updateCategoryDescriptionResult,
  call: (i, c) => gateway.updateDescription(i, c),
}),
resetCategoryDescription: createGatewayTool({
  id: 'resetCategoryDescription',
  description:
    'Reset a DEFAULT category description back to its seed. Only the seven defaults can be reset — for custom categories use updateCategoryDescription with empty description to clear. Non-destructive.',
  inputSchema: s.resetCategoryDescriptionInput,
  outputSchema: s.resetCategoryDescriptionResult,
  call: (i, c) => gateway.resetDescription(i, c),
}),
```

- [ ] **Step 2: Build**

```bash
cd apps/ai && bun run build
```

Expected: PASS.

## Task 6.4: Commit Phase 6

```bash
git add apps/ai/src/categorization/domain/categorization.gateway.ts \
        apps/ai/src/categorization/providers/http-categorization.gateway.ts \
        apps/ai/src/categorization/interface/categorization.tools.ts

git commit -m "feat(ai): mastra tools for category description editing"
```

---

# Phase 7 — `HttpTransactionClassifier` + wire `AddTransaction`

## Task 7.1: Create `HttpTransactionClassifier` from MP's `HttpPaymentClassifier`

**Files:**
- Create: `apps/api/src/categorization/providers/http-transaction-classifier.ts`

- [ ] **Step 1: Write the file (adapted from MP)**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryDescriptionResolver } from '../../shared/providers/category-description-resolver';
import {
  FALLBACK_CLASSIFICATION,
  type ClassifyArgs,
  type Classification,
  type TransactionClassifier,
} from '../domain/transaction-classifier';

const AI_BASE = process.env.AI_BASE_URL?.trim() || 'http://localhost:4111';

const classificationSchema = z.object({
  category: categorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(160).optional(),
});

@Injectable()
export class HttpTransactionClassifier implements TransactionClassifier {
  private readonly log = new Logger(HttpTransactionClassifier.name);

  constructor(
    private readonly registry: CategoryRegistry,
    private readonly descriptions: CategoryDescriptionResolver,
  ) {}

  async classify(args: ClassifyArgs): Promise<Classification> {
    const categories = (await this.descriptions.resolveAll()).map(({ name, description }) => ({ name, description }));
    const payload = { inputData: { ...args, categories } };

    try {
      return await this.attempt(payload);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await this.attempt(payload);
      } catch (err) {
        this.log.warn(`classifier unreachable, using fallback: ${String(err)}`);
        return FALLBACK_CLASSIFICATION;
      }
    }
  }

  private async attempt(payload: unknown): Promise<Classification> {
    const res = await fetch(`${AI_BASE}/api/workflows/classify-transaction/start-async`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`classifier HTTP ${res.status}`);
    const json = (await res.json()) as { status?: string; result?: unknown };
    if (json.status !== 'success' || !json.result) {
      throw new Error('classifier returned no result');
    }
    const parsed = classificationSchema.safeParse(json.result);
    if (!parsed.success) {
      throw new Error(`classifier returned an invalid result: ${parsed.error.message}`);
    }
    // Defense: LLM hallucinated a category that does not exist in the registry.
    if (!(await this.registry.exists(parsed.data.category))) {
      this.log.warn(`classifier returned unknown category "${parsed.data.category}", coercing to fallback`);
      return FALLBACK_CLASSIFICATION;
    }
    if (parsed.data.reasoning) this.log.debug(`classifier reasoning: ${parsed.data.reasoning}`);
    return parsed.data;
  }
}
```

- [ ] **Step 2: Build**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 7.2: Add `fakeTransactionClassifier` to test fakes

**Files:**
- Modify: `apps/api/src/shared/testing/fakes.ts`

- [ ] **Step 1: Append**

```ts
import type {
  ClassifyArgs,
  Classification,
  TransactionClassifier,
} from '../../categorization/domain/transaction-classifier';

export function fakeTransactionClassifier(
  respond: (args: ClassifyArgs) => Classification = () => ({ category: 'otros', confidence: 0 }),
): TransactionClassifier {
  return { classify: async (args) => respond(args) };
}
```

- [ ] **Step 2: Build**

```bash
cd apps/api && bun run build
```

Expected: PASS.

## Task 7.3: Extend `AddTransaction` tests — RED for the classifier branch

**Files:**
- Modify: `apps/api/src/transactions/use-cases/add.use-case.test.ts`

- [ ] **Step 1: Read the existing test file**

```bash
cat apps/api/src/transactions/use-cases/add.use-case.test.ts
```

- [ ] **Step 2: Add new tests**

Append (adjust imports — the file already builds an `AddTransaction` with mocks):

```ts
import { fakeTransactionClassifier } from '../../shared/testing/fakes';

test('add sets source=manual when category is provided', async () => {
  const txs = fakeTransactionsRepo();
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => { throw new Error('should not be called'); });
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), registry, classifier);

  const { transaction } = await useCase.execute({
    amount: 1000, merchant: 'X', description: 'd', category: 'comida',
  });

  expect(transaction.category).toBe('comida');
  expect(transaction.classificationSource).toBe('manual');
  expect(transaction.classificationConfidence).toBeUndefined();
});

test('add sets source=override when merchant has an override and no category is provided', async () => {
  const txs = fakeTransactionsRepo();
  const overrides = fakeCategorizationRepo({ merchants: { Rappi: 'comida' } });
  const resolver = new CategoryResolver(overrides);
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => { throw new Error('should not be called'); });
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), registry, classifier);

  const { transaction } = await useCase.execute({ amount: 1000, merchant: 'Rappi', description: 'd' });

  expect(transaction.category).toBe('comida');
  expect(transaction.classificationSource).toBe('override');
});

test('add calls the classifier when no category and no override', async () => {
  const txs = fakeTransactionsRepo();
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => ({ category: 'comida', confidence: 0.82 }));
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), registry, classifier);

  const { transaction } = await useCase.execute({ amount: 1000, merchant: 'Pedidos Ya', description: 'd' });

  expect(transaction.category).toBe('comida');
  expect(transaction.classificationSource).toBe('classifier');
  expect(transaction.classificationConfidence).toBe(0.82);
});

test('add marks source=fallback when the classifier returns confidence 0', async () => {
  const txs = fakeTransactionsRepo();
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => ({ category: 'otros', confidence: 0 }));
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), registry, classifier);

  const { transaction } = await useCase.execute({ amount: 1000, merchant: 'Desconocido', description: 'd' });

  expect(transaction.category).toBe('otros');
  expect(transaction.classificationSource).toBe('fallback');
  expect(transaction.classificationConfidence).toBe(0);
});
```

(Imports needed at the top, if not present: `CategoryResolver`, `CategoryRegistry`, `fakeCategoriesRepo`, `fakeCategorizationRepo`, `fixedClock`.)

- [ ] **Step 3: Run to verify failure**

```bash
cd apps/api && bun test src/transactions/use-cases/add.use-case.test.ts
```

Expected: FAIL — `AddTransaction` constructor does not accept a classifier; `Transaction` does not have `classificationSource`.

## Task 7.4: Update `AddTransaction` to take a classifier and ramify

**Files:**
- Modify: `apps/api/src/transactions/use-cases/add.use-case.ts`

- [ ] **Step 1: Rewrite the use-case**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { formatIso } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTION_CLASSIFIER,
  type TransactionClassifier,
} from '../../categorization/domain/transaction-classifier';
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
    @Inject(TRANSACTION_CLASSIFIER) private readonly classifier: TransactionClassifier,
  ) {}

  async execute(input: AddTransactionInput): Promise<{ transaction: Transaction }> {
    if (input.category && !(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }

    let category: Category;
    let classificationConfidence: number | undefined;
    let classificationSource: Transaction['classificationSource'];

    if (input.category) {
      category = input.category;
      classificationSource = 'manual';
    } else {
      const override = await this.categories.categoryForMerchant(input.merchant);
      if (override) {
        category = override;
        classificationSource = 'override';
      } else {
        const result = await this.classifier.classify({
          merchant: input.merchant,
          description: input.description,
          amount: input.amount,
          direction: 'expense',
        });
        category = result.category;
        classificationConfidence = result.confidence;
        classificationSource = result.confidence > 0 ? 'classifier' : 'fallback';
      }
    }

    const tx: Transaction = {
      id: await this.repo.nextId(),
      date: input.date ?? formatIso(this.clock.now()),
      amount: input.amount,
      currency: 'ARS',
      category,
      description: input.description,
      merchant: input.merchant,
      classificationSource,
      ...(classificationConfidence !== undefined ? { classificationConfidence } : {}),
    };
    await this.repo.add(tx);
    return { transaction: tx };
  }
}
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api && bun test src/transactions/use-cases/add.use-case.test.ts
```

Expected: PASS for the new cases. Any pre-existing test that called `new AddTransaction(...)` with only 4 args fails — fix by passing a fake classifier (`fakeTransactionClassifier()`).

- [ ] **Step 3: Run the full api test suite**

```bash
cd apps/api && bun test 2>&1 | tail -10
```

Expected: PASS.

## Task 7.5: Wire `TRANSACTION_CLASSIFIER` in `TransactionsModule`

**Files:**
- Modify: `apps/api/src/transactions/transactions.module.ts`

- [ ] **Step 1: Read it first**

```bash
cat apps/api/src/transactions/transactions.module.ts
```

- [ ] **Step 2: Bind**

Add imports and a provider entry:

```ts
import { HttpTransactionClassifier } from '../categorization/providers/http-transaction-classifier';
import { TRANSACTION_CLASSIFIER } from '../categorization/domain/transaction-classifier';
import { CategoryRegistry } from '../shared/providers/category-registry';
import { CategoryDescriptionResolver } from '../shared/providers/category-description-resolver';
import { JsonDefaultCategoryOverridesRepository } from '../categorization/repositories/json-default-category-overrides.repository';
import { DEFAULT_CATEGORY_OVERRIDES_REPOSITORY } from '../shared/domain/default-category-overrides';

// inside providers, ensure these are available (either by importing SharedModule/CategorizationModule
// or by listing them):
{ provide: DEFAULT_CATEGORY_OVERRIDES_REPOSITORY, useClass: JsonDefaultCategoryOverridesRepository },
CategoryDescriptionResolver,
CategoryRegistry,
{ provide: TRANSACTION_CLASSIFIER, useClass: HttpTransactionClassifier },
```

If `CategoryRegistry`/`CategoryDescriptionResolver` are already provided via an imported module, do not duplicate; just import the module. (Inspect which modules `TransactionsModule` already imports — likely `SharedModule`. If `CategorizationModule` is preferable, import it; otherwise list the providers directly.)

- [ ] **Step 3: Build + run all tests**

```bash
cd apps/api && bun run build && bun test 2>&1 | tail -10
```

Expected: PASS.

## Task 7.6: Commit Phase 7

```bash
git add apps/api/src/categorization/providers/http-transaction-classifier.ts \
        apps/api/src/shared/testing/fakes.ts \
        apps/api/src/transactions/use-cases/add.use-case.ts \
        apps/api/src/transactions/use-cases/add.use-case.test.ts \
        apps/api/src/transactions/transactions.module.ts

git commit -m "feat(api): classify uncategorized transactions via LLM workflow"
```

---

# Phase 8 — Agent prompt + request context

## Task 8.1: Extend `gasti-agent.ts` request context schema

**Files:**
- Modify: `apps/ai/src/agent/gasti-agent.ts`

- [ ] **Step 1: Replace the schema**

Change:

```ts
requestContextSchema: z.object({
  today: z.string(),
  userId: z.string(),
  categories: z.array(z.string()),
  sessionResumed: z.boolean().optional(),
}),
```

to:

```ts
requestContextSchema: z.object({
  today: z.string(),
  userId: z.string(),
  categoriesWithDescriptions: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
  sessionResumed: z.boolean().optional(),
}),
```

- [ ] **Step 2: Build**

```bash
cd apps/ai && bun run build
```

Expected: build fails — `instructions.ts` reads `categories`. Resolved in 8.3.

## Task 8.2: Update the Mastra middleware to set `categoriesWithDescriptions`

**Files:**
- Modify: `apps/ai/src/mastra/index.ts`

- [ ] **Step 1: Replace the middleware body**

The old try/catch sets `'categories'` with `categories.map((c) => c.name)`. Replace:

```ts
try {
  const { categories } = await categorizationGateway.list({}, { userId: 'default-user' });
  requestContext.set(
    'categoriesWithDescriptions',
    categories.map((c) => ({ name: c.name, description: c.description })),
  );
} catch {
  requestContext.set(
    'categoriesWithDescriptions',
    DEFAULT_CATEGORIES.map((c) => ({ name: c.name, description: c.description })),
  );
}
```

Remove the `@ts-expect-error TODO Task 8.2` line added in Task 1.5.

- [ ] **Step 2: Build**

```bash
cd apps/ai && bun run build
```

Expected: still fails on `instructions.ts` — fixed next.

## Task 8.3: Rewrite the `CATEGORIES` and `MUTATIONS` blocks in `instructions.ts`

**Files:**
- Modify: `apps/ai/src/agent/instructions.ts`

- [ ] **Step 1: Update the imports and function body**

Change the import: `import { DEFAULT_CATEGORIES } from '../shared/domain/category';` (already correct after Task 1.5).

Update how categories are read from the context:

```ts
const categoriesWithDescriptions =
  (requestContext.get('categoriesWithDescriptions') as Array<{ name: string; description: string }> | undefined)
    ?? DEFAULT_CATEGORIES.map((c) => ({ name: c.name, description: c.description }));

const categoriesBlock = categoriesWithDescriptions
  .map((c) => `  - ${c.name}: ${c.description || '(sin descripción)'}`)
  .join('\n');
```

Replace the `CATEGORIES` section with:

```ts
`CATEGORIES
- The user's spending categories right now, with the user's own description of what each one includes:
${categoriesBlock}
  Where a description is shown, treat it as the user's source of truth for what belongs in that category — it overrides any common-sense intuition you have.
  Where a description is empty (just a name), fall back to your best general understanding of the category, but if a transaction is genuinely ambiguous, surface that ambiguity instead of guessing.
- The first seven (comida, transporte, entretenimiento, salud, servicios, educacion, otros) are fixed defaults: they cannot be renamed or deleted. Any beyond those are custom categories the user created.
- If the user names a category that is NOT in the list above — whether asking about it, adding a transaction with it, or assigning a merchant/transaction to it — do NOT silently substitute "otros". Tell them it is not a category yet and ask if they want to create it. On an affirmative reply, call createCategory and then carry out what they originally asked.
- If the category IS in the list above, honor the recategorization through the override tool even when the merchant-category pairing looks unusual (a supermarket as "entretenimiento", a café as "transporte"). The user is the authority — never refuse, question, or call an existing category invalid because it seems an odd fit.
- "otros" is the catch-all ONLY when the user explicitly chooses it — never a silent fallback for a category you could not match.
- To rename or delete a custom category you MUST call proposeCategoryChange first — every time, including a repeat request — never renameCategory or deleteCategory directly, and never ask for confirmation in plain text (the tool's card asks for you). See MUTATIONS. The seven defaults cannot be renamed or deleted; if asked, explain that.
- If the user describes what a category means or should include ("comida es solo restaurantes, no super"; "agregale a transporte que incluye peajes"), call updateCategoryDescription with the full new description. Do not just acknowledge the preference in chat — persist it through the tool so the classifier learns from it.
- To wipe a description on a DEFAULT category and go back to the seed text, call resetCategoryDescription. For a custom category, call updateCategoryDescription with an empty string.
- Use listCategories when the user asks which categories exist; the result includes each category's description.`
```

(All other sections — VOICE, LANGUAGE, GROUNDING, etc. — stay as they were.)

- [ ] **Step 2: Build**

```bash
cd apps/ai && bun run build
```

Expected: PASS.

## Task 8.4: Extend the prompt test

**Files:**
- Modify: `apps/ai/src/agent/instructions.test.ts`

- [ ] **Step 1: Add a failing assertion**

```ts
test('instructions interpolate categories as "- name: description" lines', () => {
  const mockContext = {
    get(key: string) {
      if (key === 'today') return '2026-05-22';
      if (key === 'categoriesWithDescriptions') return [
        { name: 'comida', description: 'restaurantes y delivery' },
        { name: 'mascotas', description: '' },
      ];
      return undefined;
    },
  } as never;
  const prompt = buildInstructions(mockContext);
  expect(prompt).toContain('- comida: restaurantes y delivery');
  expect(prompt).toContain('- mascotas: (sin descripción)');
});
```

(Imports likely already in place — `buildInstructions` from `./instructions`.)

- [ ] **Step 2: Run**

```bash
cd apps/ai && bun test src/agent/instructions.test.ts
```

Expected: PASS.

## Task 8.5: Commit Phase 8

```bash
git add apps/ai/src/agent/gasti-agent.ts \
        apps/ai/src/agent/instructions.ts \
        apps/ai/src/agent/instructions.test.ts \
        apps/ai/src/mastra/index.ts

git commit -m "feat(ai): agent reads category descriptions in the system prompt"
```

---

# Phase 9 — UI: settings page + header nav

## Task 9.1: Create the `AppHeader` component

**Files:**
- Create: `apps/ui/src/shared/ui/app-header.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 bg-surface-1/80 backdrop-blur border-b border-line-1">
      <div className="mx-auto max-w-[720px] flex items-center justify-between px-5 h-14">
        <Link href="/" className="text-title-md font-semibold text-ink-1 tracking-tight">
          Gasti
        </Link>
        <Link
          href="/settings/categories"
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-body-sm text-ai-violet-ink hover:bg-ai-violet-soft transition-colors"
        >
          <Settings size={16} strokeWidth={1.6} />
          Configuración
        </Link>
      </div>
    </header>
  );
}
```

Note: rely on the Tailwind tokens already declared in `apps/ui/tailwind.config.ts` (per DESIGN.md "Wiring into apps/ui"). If a token like `bg-surface-1` is not mapped, use the inline CSS-variable utility (`style={{ background: 'var(--surface-1)' }}`).

- [ ] **Step 2: Verify build**

```bash
cd apps/ui && bun run build 2>&1 | tail -10
```

Expected: PASS.

## Task 9.2: Wire `AppHeader` into the root layout

**Files:**
- Modify: `apps/ui/app/layout.tsx`

- [ ] **Step 1: Read existing layout**

```bash
cat apps/ui/app/layout.tsx
```

- [ ] **Step 2: Insert the header at the top of the body wrapper**

Wrap the existing `{children}` so the header sits above. Pattern (adapt to current layout):

```tsx
import { AppHeader } from '@/shared/ui/app-header';
// ...inside the body return:
<AppHeader />
{children}
```

- [ ] **Step 3: Run the dev server briefly to confirm the header renders**

```bash
cd apps/ui && bun dev
```

Open `http://localhost:3000`, observe the header. Stop the server.

## Task 9.3: Create the route page

**Files:**
- Create: `apps/ui/app/settings/categories/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { CategorySettingsScreen } from '@/settings/components/category-settings-screen';

export default function Page() {
  return <CategorySettingsScreen />;
}
```

(The component lives in a feature folder we create next.)

## Task 9.4: Create the settings domain + repo

**Files:**
- Create: `apps/ui/src/settings/domain/category-with-description.ts`
- Create: `apps/ui/src/settings/repositories/http-categories-settings-repository.ts`

- [ ] **Step 1: Domain type**

```ts
export interface CategoryWithDescription {
  readonly name: string;
  readonly isCustom: boolean;
  readonly description: string;
}
```

- [ ] **Step 2: Repository**

```ts
import type { CategoryWithDescription } from '../domain/category-with-description';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export class HttpCategoriesSettingsRepository {
  async list(): Promise<CategoryWithDescription[]> {
    const res = await fetch(`${API_BASE}/categorization/list-categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`list-categories ${res.status}`);
    return (await res.json()).categories as CategoryWithDescription[];
  }

  async updateDescription(name: string, description: string): Promise<CategoryWithDescription> {
    const res = await fetch(`${API_BASE}/categorization/update-description`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error(`update-description ${res.status}`);
    const updated = await res.json();
    return { ...updated, isCustom: false } as CategoryWithDescription;
  }

  async resetDescription(name: string): Promise<CategoryWithDescription> {
    const res = await fetch(`${API_BASE}/categorization/reset-description`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`reset-description ${res.status}`);
    const updated = await res.json();
    return { ...updated, isCustom: false } as CategoryWithDescription;
  }
}
```

(The `isCustom` field is set explicitly because the POST endpoints return only `{name, description}`. The component re-fetches the full list after each mutation as a simpler alternative — see 9.7 step 1's `useState` strategy.)

## Task 9.5: Create the settings use-cases (UI adapters)

**Files:**
- Create: `apps/ui/src/settings/use-cases/load-categories-with-descriptions.ts`
- Create: `apps/ui/src/settings/use-cases/update-category-description.ts`
- Create: `apps/ui/src/settings/use-cases/reset-category-description.ts`

- [ ] **Step 1: Load use-case**

```ts
import type { CategoryWithDescription } from '../domain/category-with-description';
import { HttpCategoriesSettingsRepository } from '../repositories/http-categories-settings-repository';

export async function loadCategoriesWithDescriptions(): Promise<CategoryWithDescription[]> {
  return new HttpCategoriesSettingsRepository().list();
}
```

- [ ] **Step 2: Update use-case**

```ts
import { HttpCategoriesSettingsRepository } from '../repositories/http-categories-settings-repository';

export async function updateCategoryDescription(name: string, description: string) {
  return new HttpCategoriesSettingsRepository().updateDescription(name, description);
}
```

- [ ] **Step 3: Reset use-case**

```ts
import { HttpCategoriesSettingsRepository } from '../repositories/http-categories-settings-repository';

export async function resetCategoryDescription(name: string) {
  return new HttpCategoriesSettingsRepository().resetDescription(name);
}
```

## Task 9.6: Create the description editor component

**Files:**
- Create: `apps/ui/src/settings/components/category-description-editor.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';
import { useState, useEffect, useRef } from 'react';

const MAX = 240;

export interface CategoryDescriptionEditorProps {
  initial: string;
  canReset: boolean;
  onSave: (description: string) => Promise<void>;
  onReset: () => Promise<void>;
  onCancel: () => void;
}

export function CategoryDescriptionEditor(props: CategoryDescriptionEditorProps) {
  const [value, setValue] = useState(props.initial);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  async function save() {
    if (value.length > MAX || saving) return;
    setSaving(true);
    try { await props.onSave(value); } finally { setSaving(false); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void save(); }
    if (e.key === 'Escape') { e.preventDefault(); props.onCancel(); }
  }

  if (confirmReset) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className="text-body-sm text-ink-2">¿Volver al texto original?</span>
        <button onClick={() => void props.onReset()} className="px-3 h-8 rounded-full bg-ai-violet-soft text-ai-violet-ink text-body-sm">Sí</button>
        <button onClick={() => setConfirmReset(false)} className="px-3 h-8 rounded-full text-body-sm text-ink-3 hover:bg-surface-3">No</button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="rounded-md border border-line-2 bg-surface-0 px-3.5 py-3">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          aria-label="Descripción de la categoría"
          className="w-full resize-y min-h-[60px] max-h-[200px] bg-transparent text-body text-ink-1 outline-none focus:outline-2 focus:outline-ai-violet"
        />
      </div>
      <div className={`mt-1 text-right text-label-tiny ${value.length > MAX ? 'text-neg' : 'text-ink-3'}`} aria-live="polite">
        {value.length} / {MAX}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {props.canReset && (
          <button onClick={() => setConfirmReset(true)} className="px-3 h-9 rounded-full text-body-sm text-ai-violet-ink hover:bg-ai-violet-soft">
            Volver al default
          </button>
        )}
        <button onClick={props.onCancel} className="px-3 h-9 rounded-full text-body-sm text-ink-2 hover:bg-surface-3">
          Cancelar
        </button>
        <button
          onClick={() => void save()}
          disabled={value.length > MAX || saving}
          className="px-4 h-9 rounded-full bg-gradient-to-b from-[#6E61FF] to-[#4338CA] text-white text-body-sm font-semibold shadow-[0_10px_30px_-10px_rgba(79,70,229,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-40"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
```

(Where Tailwind tokens like `bg-ai-violet-soft` are not mapped in `tailwind.config.ts`, fall back to inline `style={{ background: 'var(--ai-violet-soft)' }}`. Verify by building and adjusting.)

## Task 9.7: Create the card and screen orchestrator

**Files:**
- Create: `apps/ui/src/settings/components/category-description-card.tsx`
- Create: `apps/ui/src/settings/components/category-settings-screen.tsx`

- [ ] **Step 1: Card**

```tsx
'use client';
import { useState } from 'react';
import type { CategoryWithDescription } from '../domain/category-with-description';
import { CategoryDescriptionEditor } from './category-description-editor';

export interface CategoryDescriptionCardProps {
  category: CategoryWithDescription;
  /** Seed description for defaults — used to compute whether a reset is meaningful. */
  seedDescription?: string;
  onSave: (description: string) => Promise<void>;
  onReset: () => Promise<void>;
}

export function CategoryDescriptionCard(props: CategoryDescriptionCardProps) {
  const [editing, setEditing] = useState(false);
  const { category, seedDescription } = props;
  const isDefault = !category.isCustom;
  const hasOverride = isDefault && seedDescription !== undefined && category.description !== seedDescription;

  return (
    <li
      className="rounded-[20px] border border-line-1 bg-surface-tint px-5 py-4"
      aria-labelledby={`cat-${category.name}`}
    >
      <header className="flex items-center justify-between">
        <h2 id={`cat-${category.name}`} className="text-title-sm text-ink-1">
          {category.name}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-label-tiny text-ink-3">{category.isCustom ? 'Custom' : 'Default'}</span>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-body-sm text-ai-violet-ink hover:underline">
              Editar
            </button>
          )}
        </div>
      </header>
      {!editing && (
        <p className={`mt-2 text-body ${category.description ? 'text-ink-2' : 'italic text-ink-4'}`}>
          {category.description || 'Sin descripción.'}
        </p>
      )}
      {editing && (
        <CategoryDescriptionEditor
          initial={category.description}
          canReset={!!hasOverride}
          onCancel={() => setEditing(false)}
          onSave={async (d) => { await props.onSave(d); setEditing(false); }}
          onReset={async () => { await props.onReset(); setEditing(false); }}
        />
      )}
    </li>
  );
}
```

- [ ] **Step 2: Screen orchestrator**

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import type { CategoryWithDescription } from '../domain/category-with-description';
import { loadCategoriesWithDescriptions } from '../use-cases/load-categories-with-descriptions';
import { updateCategoryDescription } from '../use-cases/update-category-description';
import { resetCategoryDescription } from '../use-cases/reset-category-description';
import { CategoryDescriptionCard } from './category-description-card';

// Hardcoded seed descriptions for diffing — kept in sync with apps/api/src/shared/domain/category.ts.
// Used only to compute whether a Reset button makes sense (UI hint, not authoritative).
const SEEDS: Record<string, string> = {
  comida: 'Restaurantes, delivery, supermercados, almacenes, kioscos, cafés.',
  transporte: 'Uber, Cabify, taxi, colectivo, subte, SUBE, combustible, peajes, estacionamiento.',
  entretenimiento: 'Streaming (Netflix, Spotify), juegos, cine, bares, salidas, eventos.',
  salud: 'Farmacia, médicos, obra social, prepaga, gimnasio, terapia.',
  servicios: 'Luz, gas, agua, internet, telefonía, expensas, suscripciones funcionales (Drive, iCloud).',
  educacion: 'Cursos, colegiatura, universidad, libros, capacitaciones, idiomas.',
  otros: 'Catch-all explícito cuando el usuario lo elige. Nunca es una caída silenciosa.',
};

export function CategorySettingsScreen() {
  const [categories, setCategories] = useState<CategoryWithDescription[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try { setCategories(await loadCategoriesWithDescriptions()); }
    catch (e) { setError(String(e)); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (error) {
    return (
      <main className="mx-auto max-w-[720px] px-5 py-8">
        <p className="text-body text-ink-2">No pudimos cargar las categorías.</p>
        <button onClick={() => void reload()} className="mt-3 px-3 h-9 rounded-full text-body-sm text-ai-violet-ink hover:bg-ai-violet-soft">Reintentar</button>
      </main>
    );
  }

  if (categories === null) {
    return (
      <main className="mx-auto max-w-[720px] px-5 py-8">
        <p className="text-body text-ink-3">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display-md text-ink-1">Categorías</h1>
        <p className="mt-2 text-body text-ink-2">
          Describí qué incluís en cada categoría. Gasti las usa para clasificar transacciones nuevas.
        </p>
      </header>
      <ul className="space-y-3">
        {categories.map((c) => (
          <CategoryDescriptionCard
            key={c.name}
            category={c}
            seedDescription={SEEDS[c.name]}
            onSave={async (d) => {
              await updateCategoryDescription(c.name, d);
              await reload();
            }}
            onReset={async () => {
              await resetCategoryDescription(c.name);
              await reload();
            }}
          />
        ))}
      </ul>
    </main>
  );
}
```

## Task 9.8: Manual UI verification

- [ ] **Step 1: Start all three apps**

```bash
cd .. && bun dev
```

- [ ] **Step 2: Verify each path**

In a browser:
1. Open `http://localhost:3000` → see header with `Gasti` + `Configuración`.
2. Click `Configuración` → land on `/settings/categories` with the 7 defaults listed.
3. Click `Editar` on `comida`, type "solo restaurantes", press `Cmd+Enter` → saves, card returns to read state with new text.
4. Click `Editar` again → see `Volver al default` button (because override exists). Click it → confirm `Sí` → text returns to seed.
5. Verify `data/default-category-overrides.json` and `data/custom-categories.json` reflect changes on disk.

- [ ] **Step 3: Stop all servers**

## Task 9.9: Commit Phase 9

```bash
git add apps/ui/src/shared/ui/app-header.tsx \
        apps/ui/app/layout.tsx \
        apps/ui/app/settings/categories/page.tsx \
        apps/ui/src/settings/

git commit -m "feat(ui): settings page for editing category descriptions"
```

---

# Phase 10 — Eval fixture + script

## Task 10.1: Create the fixture

**Files:**
- Create: `data/eval/classifier-fixture.json`

- [ ] **Step 1: Hand-curate 20–30 entries**

```json
[
  { "merchant": "Rappi",          "description": "pedido del lunes",       "amount": 8500,  "expected": "comida" },
  { "merchant": "Coto",           "description": "compra semanal",         "amount": 22000, "expected": "comida" },
  { "merchant": "Starbucks",      "description": "café",                   "amount": 3500,  "expected": "comida" },
  { "merchant": "Uber",           "description": null,                     "amount": 4200,  "expected": "transporte" },
  { "merchant": "Cabify",         "description": "aeropuerto",             "amount": 12000, "expected": "transporte" },
  { "merchant": "YPF",            "description": "carga combustible",      "amount": 28000, "expected": "transporte" },
  { "merchant": "SUBE",           "description": "carga",                  "amount": 5000,  "expected": "transporte" },
  { "merchant": "Netflix",        "description": "suscripción mensual",    "amount": 4990,  "expected": "entretenimiento" },
  { "merchant": "Spotify",        "description": null,                     "amount": 1990,  "expected": "entretenimiento" },
  { "merchant": "Cinemark",       "description": "entrada 2 personas",     "amount": 9000,  "expected": "entretenimiento" },
  { "merchant": "Farmacity",      "description": "ibuprofeno",             "amount": 2500,  "expected": "salud" },
  { "merchant": "OSDE",           "description": "cuota mensual",          "amount": 85000, "expected": "salud" },
  { "merchant": "SmartFit",       "description": "abono mensual gym",      "amount": 18000, "expected": "salud" },
  { "merchant": "Edenor",         "description": "factura luz",            "amount": 12000, "expected": "servicios" },
  { "merchant": "Metrogas",       "description": "factura gas",            "amount": 6000,  "expected": "servicios" },
  { "merchant": "Movistar",       "description": "plan móvil",             "amount": 9500,  "expected": "servicios" },
  { "merchant": "Coderhouse",     "description": "curso react",            "amount": 35000, "expected": "educacion" },
  { "merchant": "Platzi",         "description": "suscripción anual",      "amount": 65000, "expected": "educacion" },
  { "merchant": "Cuit Universidad","description": "cuota carrera",         "amount": 95000, "expected": "educacion" },
  { "merchant": "Mercado Libre",  "description": "auriculares bluetooth",  "amount": 18000, "expected": "otros" },
  { "merchant": "Easy",           "description": "destornillador y clavos","amount": 5500,  "expected": "otros" },
  { "merchant": "Veterinaria Patitas", "description": "consulta gato",     "amount": 8000,  "expected": "salud" },
  { "merchant": "Pez Gordo",      "description": "comida pez",             "amount": 3500,  "expected": "otros" },
  { "merchant": "Garbarino",      "description": "monitor LG 24",          "amount": 145000,"expected": "otros" },
  { "merchant": "Bar Plaza",      "description": "cervezas y picada",      "amount": 12000, "expected": "entretenimiento" }
]
```

(Tune entries you think are most representative of your real spending.)

## Task 10.2: Create the eval script

**Files:**
- Create: `scripts/eval-classifier.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Eval the classify-transaction workflow against a hand-curated fixture.
 *
 * Usage:
 *   1. Start apps/ai:   cd apps/ai && bun dev
 *   2. Start apps/api:  cd apps/api && bun dev
 *   3. Run:             bun run scripts/eval-classifier.ts
 */
import fixture from '../data/eval/classifier-fixture.json' assert { type: 'json' };

const API = process.env.API_BASE_URL ?? 'http://localhost:3001';
const AI = process.env.AI_BASE_URL ?? 'http://localhost:4111';

interface FixtureEntry { merchant: string; description: string | null; amount: number; expected: string; }

async function fetchCategories(): Promise<Array<{ name: string; description: string }>> {
  const res = await fetch(`${API}/categorization/list-categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  return (await res.json()).categories;
}

async function classify(entry: FixtureEntry, categories: Array<{ name: string; description: string }>) {
  const res = await fetch(`${AI}/api/workflows/classify-transaction/start-async`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inputData: { merchant: entry.merchant, description: entry.description, amount: entry.amount, direction: 'expense', categories },
    }),
  });
  const json = await res.json();
  if (json.status !== 'success') throw new Error(`workflow ${json.status}`);
  return json.result as { category: string; confidence: number; reasoning?: string };
}

async function main() {
  const categories = await fetchCategories();
  let hits = 0;
  let lowConfidence = 0;
  let totalConfidence = 0;
  const wrong: Array<{ entry: FixtureEntry; got: string; conf: number }> = [];

  for (const entry of fixture as FixtureEntry[]) {
    const r = await classify(entry, categories);
    const hit = r.category === entry.expected;
    if (hit) hits++; else wrong.push({ entry, got: r.category, conf: r.confidence });
    if (r.confidence < 0.4) lowConfidence++;
    totalConfidence += r.confidence;
    console.log(`${hit ? '✓' : '✗'} ${entry.merchant.padEnd(24)} expected=${entry.expected.padEnd(16)} got=${r.category.padEnd(16)} conf=${r.confidence.toFixed(2)}`);
  }

  console.log('\n--- Summary ---');
  console.log(`Accuracy:        ${hits}/${fixture.length} (${((hits / fixture.length) * 100).toFixed(1)}%)`);
  console.log(`Avg confidence:  ${(totalConfidence / fixture.length).toFixed(3)}`);
  console.log(`Low conf (<0.4): ${lowConfidence}`);
  if (wrong.length > 0) {
    console.log('\nWrong:');
    for (const w of wrong) console.log(`  ${w.entry.merchant} → expected ${w.entry.expected}, got ${w.got} (${w.conf.toFixed(2)})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it (apps/ai + apps/api must be up)**

```bash
bun run scripts/eval-classifier.ts
```

Expected: ≥ 80% accuracy on this fixture, avg confidence > 0.6, low-confidence count < 6/25.

If results are worse than baseline expectation, tune the seed descriptions in `apps/api/src/shared/domain/category.ts` (and the mirror in `apps/ai`) and re-run. Iterate.

## Task 10.3: Commit Phase 10

```bash
git add data/eval/classifier-fixture.json scripts/eval-classifier.ts

git commit -m "test: eval fixture and script for classifier accuracy"
```

---

# Phase 11 — Smoke E2E + finish

## Task 11.1: End-to-end smoke checklist

- [ ] **Step 1: Start all three apps**

```bash
bun dev
```

- [ ] **Step 2: Walk through the user-facing surfaces**

1. Browser at `http://localhost:3000` → chat surface loads.
2. In chat: *"Agregale a hoy una compra en Pedidos Ya de 5000."* → agent calls `addTransaction` without `category` → API calls classifier → tx persisted with `category: comida`, `classificationSource: classifier`, confidence visible in the dev log of `apps/api`.
3. Go to `/settings/categories`, edit `comida` to "solo restaurantes, no super, no kiosco", save.
4. Back in chat: *"Agregale a hoy una compra en Coto de 18000."* → expect category to NOT be `comida` (because the description excludes super). Most likely → `otros` with low confidence. The agent should surface the ambiguity or ask.
5. In chat: *"Coto es comida"* → agent calls `overrideMerchantCategory`. Next time you say *"compra en Coto"* the override path fires (no classifier call).
6. Reset `comida` from settings → seed restored. Verify `data/default-category-overrides.json` no longer has the key.

- [ ] **Step 3: Stop all servers**

## Task 11.2: Final test run

```bash
cd apps/api && bun test 2>&1 | tail -10
cd ../ai && bun test 2>&1 | tail -10
```

Expected: both green.

## Task 11.3: Optional plan-completion commit

If any small cleanup remained, commit it now with `chore: cleanup`. Otherwise skip.

---

# Self-review checklist (run before declaring complete)

- [ ] Every spec section maps to at least one task: scope decisions (§2), domain (§4), persistence/migration (§5), classifier (§6), use-cases/tools/agent (§7), UI (§8), errors (§9), testing (§10), order (§11), out-of-scope (§12), files (§13). All covered above.
- [ ] No `TBD`, `TODO` in the plan text. (The `TODO Task 2.1` markers added in Task 1.2 are temporary stubs explicitly removed by Phase 2.)
- [ ] Types match across tasks: `Classification`, `ClassifyArgs`, `TransactionClassifier`, `CategoryDefinition`, `CustomCategoryDefinition`, `DefaultCategoryOverrides` are defined once (Phase 1) and referenced consistently afterward.
- [ ] Every test step shows real code, not a placeholder.
- [ ] Every commit step lists the exact files staged.
