# Category Mutation Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give category delete/rename the same propose → confirmation-card → gated-mutation flow that transaction deletes already have, with the affected-transaction count rendered in the card.

**Architecture:** Add a category-specific vertical slice mirroring `proposeTransactionMutation` — a read-only `ProposeCategoryChange` use-case in `apps/api`, a controller route, an `apps/ai` gateway method and `proposeCategoryChange` tool, and an `apps/ui` attachment mapping to the existing `optionPills` card. Everything downstream of the tool result (`option-pill-stack.tsx`, `resolveOptionLabel`, the pill→text confirm path, confirmation-gating) is reused unchanged.

**Tech Stack:** NestJS 10 + Zod (`apps/api`), Mastra `createTool` + Zod (`apps/ai`), Next.js 15 + React 19 + Tailwind (`apps/ui`), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-05-18-category-mutation-confirmation-design.md`

---

## File Structure

**`apps/api` — `categorization` feature**
- Create `apps/api/src/categorization/use-cases/propose-category-change.use-case.ts` — read-only use-case: validate + count affected transactions.
- Create `apps/api/src/categorization/use-cases/propose-category-change.use-case.test.ts` — `bun:test` unit tests.
- Modify `apps/api/src/categorization/interface/categorization.schemas.ts` — add request schema.
- Modify `apps/api/src/categorization/interface/categorization.controller.ts` — add route.
- Modify `apps/api/src/categorization/categorization.module.ts` — register the use-case.

**`apps/ai` — `categorization` feature**
- Modify `apps/ai/src/categorization/domain/categorization.gateway.ts` — add schemas + interface method.
- Modify `apps/ai/src/categorization/providers/http-categorization.gateway.ts` — add route mapping.
- Modify `apps/ai/src/categorization/interface/categorization.tools.ts` — add `proposeCategoryChange` tool, mark `deleteCategory`/`renameCategory` confirmation-gated.
- Modify `apps/ai/src/agent/instructions.ts` — wire category mutations into the `MUTATIONS`/`CATEGORIES`/`PRESENTATION` rules.

**`apps/ui`**
- Modify `apps/ui/src/chat/domain/message.ts` — add `caption?` to the `optionPills` attachment.
- Modify `apps/ui/src/shared/ui/option-pill-stack.tsx` — render the caption.
- Modify `apps/ui/src/chat/components/message-attachments.tsx` — pass the caption through.
- Modify `apps/ui/src/chat/providers/tool-result-attachment.ts` — map `proposeCategoryChange` to an `optionPills` attachment.

All `bun` / `bun run` commands are run from the repo root.

---

## Task 1: `ProposeCategoryChange` use-case (`apps/api`)

**Files:**
- Create: `apps/api/src/categorization/use-cases/propose-category-change.use-case.ts`
- Test: `apps/api/src/categorization/use-cases/propose-category-change.use-case.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/categorization/use-cases/propose-category-change.use-case.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { ProposeCategoryChange } from './propose-category-change.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { DomainError } from '../../shared/domain/domain-error';
import {
  fakeCategoriesRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
} from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';
import type { CategoryOverrides } from '../../shared/domain/category-overrides';

const tx = (id: string, category: string, merchant = 'Coto'): Transaction => ({
  id,
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category,
  description: '',
  merchant,
});

function build(opts: {
  categories?: string[];
  txs?: Transaction[];
  overrides?: Partial<CategoryOverrides>;
}) {
  const categories = fakeCategoriesRepo(opts.categories ?? []);
  const catRepo = fakeCategorizationRepo(opts.overrides);
  return new ProposeCategoryChange(
    fakeTransactionsRepo(opts.txs ?? []),
    new CategoryResolver(catRepo),
    new CategoryRegistry(categories),
  );
}

test('delete proposal counts transactions whose base category matches', async () => {
  const useCase = build({
    categories: ['mascotas'],
    txs: [tx('txn_001', 'mascotas'), tx('txn_002', 'mascotas'), tx('txn_003', 'comida')],
  });
  const result = await useCase.execute({ intent: 'delete', name: 'Mascotas' });
  expect(result).toEqual({ intent: 'delete', name: 'mascotas', affectedTransactionCount: 2 });
});

test('delete proposal counts transactions pulled in by an override', async () => {
  const useCase = build({
    categories: ['mascotas'],
    txs: [tx('txn_001', 'comida', 'Pet Shop'), tx('txn_002', 'comida', 'Coto')],
    overrides: { merchants: { 'Pet Shop': 'mascotas' }, transactions: { txn_002: 'mascotas' } },
  });
  const result = await useCase.execute({ intent: 'delete', name: 'mascotas' });
  expect(result.affectedTransactionCount).toBe(2);
});

test('delete proposal returns 0 for an empty custom category', async () => {
  const useCase = build({ categories: ['mascotas'], txs: [tx('txn_001', 'comida')] });
  const result = await useCase.execute({ intent: 'delete', name: 'mascotas' });
  expect(result.affectedTransactionCount).toBe(0);
});

test('delete proposal rejects a default category', async () => {
  const useCase = build({});
  await expect(useCase.execute({ intent: 'delete', name: 'comida' })).rejects.toThrow(DomainError);
});

test('delete proposal rejects an unknown category', async () => {
  const useCase = build({});
  await expect(
    useCase.execute({ intent: 'delete', name: 'inexistente' }),
  ).rejects.toThrow(DomainError);
});

test('rename proposal returns intent, names and count', async () => {
  const useCase = build({
    categories: ['mascotas'],
    txs: [tx('txn_001', 'mascotas')],
  });
  const result = await useCase.execute({ intent: 'rename', name: 'Mascotas', newName: 'Animales' });
  expect(result).toEqual({
    intent: 'rename',
    name: 'mascotas',
    newName: 'animales',
    affectedTransactionCount: 1,
  });
});

test('rename proposal rejects a target that already exists', async () => {
  const useCase = build({ categories: ['mascotas', 'viajes'] });
  await expect(
    useCase.execute({ intent: 'rename', name: 'mascotas', newName: 'Viajes' }),
  ).rejects.toThrow(DomainError);
});

test('rename proposal rejects a target longer than 24 characters', async () => {
  const useCase = build({ categories: ['mascotas'] });
  await expect(
    useCase.execute({ intent: 'rename', name: 'mascotas', newName: 'x'.repeat(25) }),
  ).rejects.toThrow(DomainError);
});

test('rename proposal allows renaming to the same normalized name', async () => {
  const useCase = build({ categories: ['mascotas'] });
  const result = await useCase.execute({ intent: 'rename', name: 'mascotas', newName: 'Mascotas' });
  expect(result).toEqual({
    intent: 'rename',
    name: 'mascotas',
    newName: 'mascotas',
    affectedTransactionCount: 0,
  });
});

test('rename proposal rejects a missing new name', async () => {
  const useCase = build({ categories: ['mascotas'] });
  await expect(
    useCase.execute({ intent: 'rename', name: 'mascotas' }),
  ).rejects.toThrow(DomainError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/api/src/categorization/use-cases/propose-category-change.use-case.test.ts`
Expected: FAIL — `Cannot find module './propose-category-change.use-case'`.

- [ ] **Step 3: Write the use-case**

Create `apps/api/src/categorization/use-cases/propose-category-change.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { normalizeCategoryName } from '../providers/category-name';

export interface ProposeCategoryChangeInput {
  intent: 'delete' | 'rename';
  name: string;
  newName?: string;
}

export interface ProposeCategoryChangeResult {
  intent: 'delete' | 'rename';
  name: string;
  newName?: string;
  affectedTransactionCount: number;
}

/** Read-only. Validates a category delete/rename and counts the transactions it would move. */
@Injectable()
export class ProposeCategoryChange {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly resolver: CategoryResolver,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: ProposeCategoryChangeInput): Promise<ProposeCategoryChangeResult> {
    const name = normalizeCategoryName(input.name);
    const verb = input.intent === 'delete' ? 'borrar' : 'renombrar';

    if (this.registry.isDefault(name)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `"${name}" es una categoría por defecto y no se puede ${verb}.`,
      );
    }
    if (!(await this.registry.isCustom(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }

    let newName: string | undefined;
    if (input.intent === 'rename') {
      if (input.newName === undefined) {
        throw new DomainError('VALIDATION_ERROR', 'Falta el nuevo nombre de la categoría.');
      }
      newName = normalizeCategoryName(input.newName);
      if (newName.length === 0 || newName.length > 24) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'El nombre de la categoría debe tener entre 1 y 24 caracteres.',
        );
      }
      if (newName !== name && (await this.registry.exists(newName))) {
        throw new DomainError('VALIDATION_ERROR', `La categoría "${newName}" ya existe.`);
      }
    }

    const txs = await this.txRepo.all();
    const resolved = await this.resolver.resolveAll(txs);
    let affectedTransactionCount = 0;
    for (const tx of txs) {
      if (resolved.get(tx.id) === name) affectedTransactionCount += 1;
    }

    return {
      intent: input.intent,
      name,
      ...(newName !== undefined ? { newName } : {}),
      affectedTransactionCount,
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/api/src/categorization/use-cases/propose-category-change.use-case.test.ts`
Expected: PASS — 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/categorization/use-cases/propose-category-change.use-case.ts apps/api/src/categorization/use-cases/propose-category-change.use-case.test.ts
git commit -m "feat: add propose-category-change use-case"
```

---

## Task 2: Wire the propose route (`apps/api`)

**Files:**
- Modify: `apps/api/src/categorization/interface/categorization.schemas.ts`
- Modify: `apps/api/src/categorization/interface/categorization.controller.ts`
- Modify: `apps/api/src/categorization/categorization.module.ts`

- [ ] **Step 1: Add the request schema**

In `apps/api/src/categorization/interface/categorization.schemas.ts`, append after the `deleteCategoryInput` block:

```ts
export const proposeCategoryChangeInput = z.object({
  intent: z.enum(['delete', 'rename']),
  name: z.string().min(1),
  newName: z.string().min(1).max(24).optional(),
});
```

- [ ] **Step 2: Add the controller route**

In `apps/api/src/categorization/interface/categorization.controller.ts`:

Add the import alongside the other use-case imports:

```ts
import {
  ProposeCategoryChange,
  type ProposeCategoryChangeInput,
} from '../use-cases/propose-category-change.use-case';
```

Add `proposeCategoryChangeInput` to the schema import block:

```ts
import {
  createCategoryInput,
  deleteCategoryInput,
  overrideMerchantInput,
  overrideTransactionInput,
  proposeCategoryChangeInput,
  renameCategoryInput,
} from './categorization.schemas';
```

Add the constructor parameter after `list`:

```ts
    private readonly list: ListCategories,
    private readonly propose: ProposeCategoryChange,
  ) {}
```

Add the route after `listCategories()`:

```ts
  @Post('propose-category-change')
  proposeCategoryChange(
    @Body(new ZodValidationPipe(proposeCategoryChangeInput)) body: ProposeCategoryChangeInput,
  ) {
    return this.propose.execute(body);
  }
```

- [ ] **Step 3: Register the use-case in the module**

In `apps/api/src/categorization/categorization.module.ts`, add the import:

```ts
import { ProposeCategoryChange } from './use-cases/propose-category-change.use-case';
```

Add `ProposeCategoryChange` to the `providers` array (after `ListCategories`):

```ts
  providers: [
    OverrideMerchantCategory,
    OverrideTransactionCategory,
    CreateCategory,
    RenameCategory,
    DeleteCategory,
    ListCategories,
    ProposeCategoryChange,
  ],
```

- [ ] **Step 4: Verify the API builds**

Run: `bun run build --filter=api`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Verify the route responds**

Start the API: `bun dev --filter=api` (leave running in a second terminal). Then:

```bash
curl -s -X POST http://localhost:3001/categorization/propose-category-change \
  -H 'Content-Type: application/json' -d '{"intent":"delete","name":"comida"}'
```

Expected: a 4xx response whose body reports `comida` is a default category and cannot be borrar (the `DomainError` surfaced by the controller). This confirms validation runs. Stop the API afterward.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/categorization/interface/categorization.schemas.ts apps/api/src/categorization/interface/categorization.controller.ts apps/api/src/categorization/categorization.module.ts
git commit -m "feat: add propose-category-change route to the categorization controller"
```

---

## Task 3: AI gateway schemas and `proposeCategoryChange` tool (`apps/ai`)

**Files:**
- Modify: `apps/ai/src/categorization/domain/categorization.gateway.ts`
- Modify: `apps/ai/src/categorization/providers/http-categorization.gateway.ts`
- Modify: `apps/ai/src/categorization/interface/categorization.tools.ts`

- [ ] **Step 1: Add gateway schemas, types and the interface method**

In `apps/ai/src/categorization/domain/categorization.gateway.ts`, add after the `listCategoriesResult` block:

```ts
export const proposeCategoryChangeInput = z.object({
  intent: z.enum(['delete', 'rename']),
  name: z.string().min(1),
  newName: z.string().min(1).max(24).optional(),
});
export const proposeCategoryChangeResult = z.object({
  intent: z.enum(['delete', 'rename']),
  name: z.string(),
  newName: z.string().optional(),
  affectedTransactionCount: z.number(),
});
```

Add the inferred types alongside the other `export type` lines:

```ts
export type ProposeCategoryChangeInput = z.infer<typeof proposeCategoryChangeInput>;
export type ProposeCategoryChangeResult = z.infer<typeof proposeCategoryChangeResult>;
```

Add the method to the `CategorizationGateway` interface (after `list`):

```ts
  list(input: ListCategoriesInput, ctx: GatewayCtx): Promise<ListCategoriesResult>;
  propose(
    input: ProposeCategoryChangeInput,
    ctx: GatewayCtx,
  ): Promise<ProposeCategoryChangeResult>;
}
```

- [ ] **Step 2: Add the HTTP route mapping**

In `apps/ai/src/categorization/providers/http-categorization.gateway.ts`, add the `propose` entry to the route map:

```ts
  return makeHttpGateway<CategorizationGateway>(api, {
    overrideMerchant: '/categorization/merchant',
    overrideTransaction: '/categorization/transaction',
    create: '/categorization/create-category',
    rename: '/categorization/rename-category',
    remove: '/categorization/delete-category',
    list: '/categorization/list-categories',
    propose: '/categorization/propose-category-change',
  });
```

- [ ] **Step 3: Add the tool and mark the mutators confirmation-gated**

In `apps/ai/src/categorization/interface/categorization.tools.ts`, replace the `renameCategory` and `deleteCategory` tool descriptions and add `proposeCategoryChange`.

Replace the `renameCategory` description string with:

```ts
      description:
        'Rename a custom category. Confirmation-gated: only call after proposeCategoryChange and an explicit user confirmation. Existing transactions, overrides and budgets follow the rename. The seven default categories cannot be renamed.',
```

Replace the `deleteCategory` description string with:

```ts
      description:
        'Delete a custom category. Confirmation-gated: only call after proposeCategoryChange and an explicit user confirmation. Everything assigned to it falls back to "otros". The seven default categories cannot be deleted.',
```

Add a new tool entry after `listCategories` (before the closing `};`):

```ts
    proposeCategoryChange: createGatewayTool({
      id: 'proposeCategoryChange',
      description:
        'Read-only. Identify a custom-category delete or rename and present it for confirmation; returns the count of transactions the change will move. Always call this before deleteCategory or renameCategory.',
      inputSchema: s.proposeCategoryChangeInput,
      outputSchema: s.proposeCategoryChangeResult,
      call: (i, c) => gateway.propose(i, c),
    }),
```

- [ ] **Step 4: Verify the AI workspace builds**

Run: `bun run build --filter=ai`
Expected: build succeeds, no TypeScript errors. (The `proposeCategoryChange` key on the object returned by `makeCategorizationTools` is automatically registered with the agent — no separate registration step.)

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/categorization/domain/categorization.gateway.ts apps/ai/src/categorization/providers/http-categorization.gateway.ts apps/ai/src/categorization/interface/categorization.tools.ts
git commit -m "feat: add proposeCategoryChange tool to the agent"
```

---

## Task 4: UI confirmation card with caption (`apps/ui`)

**Files:**
- Modify: `apps/ui/src/chat/domain/message.ts`
- Modify: `apps/ui/src/shared/ui/option-pill-stack.tsx`
- Modify: `apps/ui/src/chat/components/message-attachments.tsx`
- Modify: `apps/ui/src/chat/providers/tool-result-attachment.ts`

- [ ] **Step 1: Add `caption` to the `optionPills` attachment type**

In `apps/ui/src/chat/domain/message.ts`, change the `optionPills` member of `MessageAttachment`:

```ts
  | { kind: 'optionPills'; options: OptionPill[]; resolved?: boolean; caption?: string };
```

- [ ] **Step 2: Render the caption in `OptionPillStack`**

Replace the contents of `apps/ui/src/shared/ui/option-pill-stack.tsx` with:

```tsx
'use client';

export type Option = {
  id: string;
  label: string;
  intent?: 'confirm' | 'cancel';
  disabled?: boolean;
};

type OptionPillStackProps = {
  options: Option[];
  onPick: (id: string) => void;
  label?: string;
  caption?: string;
};

export function OptionPillStack({
  options,
  onPick,
  label = 'Opciones',
  caption,
}: OptionPillStackProps) {
  return (
    <div className="flex flex-col gap-s2">
      {caption && (
        <p className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {caption}
        </p>
      )}
      <div role="group" aria-label={label} className="flex flex-col gap-s2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={opt.disabled}
            onClick={() => onPick(opt.id)}
            style={{
              transition:
                'transform var(--dur-fast) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
            }}
            className={[
              'w-full rounded-md border border-line-1 bg-surface-tint',
              'px-s4 py-s3 text-center font-display text-[14px] font-semibold text-ai-ink',
              'active:scale-[0.985]',
              'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
              'disabled:opacity-30 disabled:pointer-events-none',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Pass the caption through `MessageAttachments`**

In `apps/ui/src/chat/components/message-attachments.tsx`, change the `optionPills` branch:

```tsx
        if (a.kind === 'optionPills') {
          const options = a.options.map((o) => ({ ...o, disabled: a.resolved }));
          return (
            <OptionPillStack
              key={idx}
              options={options}
              caption={a.caption}
              onPick={(id) => void pickOption(id)}
            />
          );
        }
```

- [ ] **Step 4: Map `proposeCategoryChange` to an `optionPills` attachment**

In `apps/ui/src/chat/providers/tool-result-attachment.ts`, add this helper above the `toAttachment` function:

```ts
/** Spanish caption stating how many transactions a category change will move. */
function categoryChangeCaption(r: Record<string, unknown>): string {
  const count = typeof r.affectedTransactionCount === 'number' ? r.affectedTransactionCount : 0;
  if (count === 0) return 'Ninguna transacción será afectada.';
  const noun = count === 1 ? 'transacción' : 'transacciones';
  const verb = count === 1 ? 'pasará' : 'pasarán';
  const target = str(r.intent) === 'rename' ? str(r.newName) : 'otros';
  return `${count} ${noun} ${verb} a "${target}".`;
}
```

Add a `case` to the `switch (toolName)` block in `toAttachment`, before `default:`:

```ts
    case 'proposeCategoryChange': {
      const intent = str(r.intent);
      if (intent !== 'delete' && intent !== 'rename') return null;
      const name = str(r.name);
      const confirmLabel = intent === 'delete' ? 'Sí, borrala' : 'Sí, renombrala';
      return {
        kind: 'optionPills',
        caption: categoryChangeCaption(r),
        options: [
          { id: `confirm:${intent}:${name}`, label: confirmLabel, intent: 'confirm' },
          { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
        ],
      };
    }
```

- [ ] **Step 5: Verify the UI builds**

Run: `bun run build --filter=ui`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/chat/domain/message.ts apps/ui/src/shared/ui/option-pill-stack.tsx apps/ui/src/chat/components/message-attachments.tsx apps/ui/src/chat/providers/tool-result-attachment.ts
git commit -m "feat: render category-change confirmation card with affected count"
```

---

## Task 5: Agent instructions for category mutations (`apps/ai`)

**Files:**
- Modify: `apps/ai/src/agent/instructions.ts`

- [ ] **Step 1: Update the `CATEGORIES` rename/delete line**

In `apps/ai/src/agent/instructions.ts`, find this line in the `CATEGORIES` section:

```
- To rename or delete a custom category, use renameCategory or deleteCategory. Deleting a category reassigns everything in it to "otros" — say so plainly before doing it. The seven defaults cannot be renamed or deleted; if asked, explain that.
```

Replace it with:

```
- To rename or delete a custom category, follow the MUTATIONS rules — call proposeCategoryChange first, never renameCategory or deleteCategory directly. The seven defaults cannot be renamed or deleted; if asked, explain that.
```

- [ ] **Step 2: Update the `PRESENTATION` rich-cards line**

Find this line in the `PRESENTATION` section:

```
- The interface renders some tool results as rich cards: listTransactions and proposeTransactionMutation show a transaction-list card; getBudgetProgress shows a budget card.
```

Replace it with:

```
- The interface renders some tool results as rich cards: listTransactions and proposeTransactionMutation show a transaction-list card; getBudgetProgress shows a budget card; proposeCategoryChange shows a confirmation card with buttons and the affected-transaction count.
```

- [ ] **Step 3: Add category mutation rules to the `MUTATIONS` section**

In the `MUTATIONS` section, find this line:

```
- An edit request that does not say what to change ("cambiá la transacción txn_005") → ask which field and the new value before proposing anything.
```

Insert the following four lines immediately after it:

```
- To delete or rename a custom category, never call deleteCategory or renameCategory directly. First call proposeCategoryChange (read-only) with intent "delete" or "rename"; it shows a confirmation card with the affected-transaction count.
- Only after an explicit affirmative reply approving THAT specific change — tapping "Sí, borrala" / "Sí, renombrala", or clear text like "sí", "dale", "confirmo" — call deleteCategory or renameCategory. Any other next message drops the proposal; never delete or rename a category as a side effect of an unrelated turn.
- A proposeCategoryChange proposal is valid only for the single user turn that immediately follows it. If that turn does not clearly confirm, the proposal expires.
- A rename needs the new name. If the user has not said what to rename the category to, ask before calling proposeCategoryChange. The confirmation card already states the affected-transaction count — do not repeat the number.
```

- [ ] **Step 4: Verify the AI workspace builds**

Run: `bun run build --filter=ai`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/agent/instructions.ts
git commit -m "feat: instruct the agent to confirm category delete and rename"
```

---

## Manual verification (after all tasks)

Run the full stack (`apps/ai/.env` must hold `OPENAI_API_KEY`):

```bash
export $(grep -E '^OPENAI_API_KEY=' apps/ai/.env | xargs)
bun dev --env-mode=loose
```

Open `http://localhost:3000` and check, pacing prompts ~1 minute apart to stay under the OpenAI rate limit:

1. Create a custom category (`creá la categoría mascotas`), then `borrá mascotas` → a confirmation card renders with a caption ("Ninguna transacción será afectada." for an empty category) and "Sí, borrala" / "Cancelar" buttons. Tap "Sí, borrala" → the category is deleted.
2. Recreate it, assign a couple of transactions/merchants to it, then `borrá mascotas` → the caption shows the transaction count (singular "1 transacción pasará…", plural "N transacciones pasarán…"). Confirm → deleted, content moved to `otros`.
3. `renombrá mascotas a animales` → card caption references `animales`. Tap "Sí, renombrala" → renamed, cascade applied.
4. Trigger a propose, then send an unrelated message instead of confirming → nothing is deleted or renamed.
5. `borrá comida` (a default) → the agent refuses in text, no card appears.
6. Delete a transaction (`borrá la transacción de …`) → its confirmation card still renders with no caption — the transaction flow is unchanged.

---

## Self-Review

**Spec coverage:**
- Goal 1 (propose step renders a two-button card) — Tasks 3, 4.
- Goal 2 (affected-transaction count, deterministic in the card) — Task 1 (count), Task 4 (caption rendering).
- Goal 3 (`deleteCategory`/`renameCategory` confirmation-gated) — Task 3 (tool descriptions), Task 5 (instructions).
- Goal 4 (mirror `proposeTransactionMutation`, reuse infrastructure) — Tasks 3–4 reuse `optionPills`, `option-pill-stack.tsx`, `resolveOptionLabel`, the pill→text path untouched.
- Empty-category caption ("Ninguna transacción será afectada.") — Task 1 test + Task 4 helper.
- `ProposeCategoryChange` unit tests (default rejection, unknown, collision, length, same-name no-op, override counting, 0 count) — Task 1.
- Out-of-scope items (budget/merchant counts, reload-void, `createCategory` confirmation) — correctly absent from all tasks.

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command has expected output.

**Type consistency:** `ProposeCategoryChangeInput`/`Result` (`{ intent, name, newName?, affectedTransactionCount }`) are identical across the API use-case (Task 1), API schema (Task 2), and AI gateway schemas (Task 3). The tool result keys (`intent`, `name`, `newName`, `affectedTransactionCount`) match what `categoryChangeCaption` and the `proposeCategoryChange` case read in Task 4. The `optionPills` attachment gains `caption?: string` in Task 4 Step 1 and is consumed in Steps 2–4. Gateway method name `propose` is consistent across the interface (Task 3 Step 1), the route map (Step 2), and the tool `call` (Step 3).
