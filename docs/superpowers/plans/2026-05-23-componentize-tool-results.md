# Componentize tool results — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rich card attachments for every Mastra tool that returns structured data (lists, rankings, comparisons, single computed totals), collapsing the agent's text reply to one headline sentence.

**Architecture:** Four generic UI primitives (`StatCard`, `RankedListCard`, `CompareListCard`, `BulletListCard`) in `apps/ui/src/shared/ui/`. The `MessageAttachment` union gains four new `kind`s. Each Mastra tool's `transform` (in `createGatewayTool`) maps the gateway output to one attachment kind, returning `null` when empty (no card → agent narrates).

**Tech Stack:** Mastra `@mastra/core` (tool transforms), NestJS 10 (gateway / use-case), Zod (schemas), Next.js 15 + React 19 + Tailwind 3 (UI), Bun (runtime, test runner).

**Spec:** `docs/superpowers/specs/2026-05-23-componentize-tool-results-design.md`

---

## File map

**New files:**
- `apps/ui/src/shared/format/capitalize.ts`
- `apps/ui/src/shared/ui/stat-card.tsx`
- `apps/ui/src/shared/ui/ranked-list-card.tsx`
- `apps/ui/src/shared/ui/compare-list-card.tsx`
- `apps/ui/src/shared/ui/bullet-list-card.tsx`

**Modified files:**
- `apps/ai/src/shared/interface/create-gateway-tool.ts` (allow null transform)
- `apps/ai/src/spending/domain/spending.gateway.ts` (add `labelA`/`labelB` to `compareResult`)
- `apps/ai/src/spending/interface/spending.tools.ts` (4 transforms)
- `apps/ai/src/insights/interface/insights.tools.ts` (3 transforms)
- `apps/ai/src/categorization/interface/categorization.tools.ts` (2 transforms)
- `apps/ai/src/agent/instructions.ts` (PRESENTATION section)
- `apps/api/src/spending/use-cases/compare.use-case.ts` (emit `labelA`/`labelB`)
- `apps/api/src/spending/use-cases/spending.use-cases.test.ts` (update compare assertion)
- `apps/ui/src/chat/domain/message.ts` (extend union)
- `apps/ui/src/chat/components/message-attachments.tsx` (4 new branches)
- `apps/ui/src/budgets/components/budget-progress-card.tsx` (use shared capitalize)

---

## Task 1: Set up worktree

**Files:** none (git operations only)

- [ ] **Step 1: Confirm clean repo**

Run: `git status -s`
Expected: only the untracked artifacts already present (`.claire/`, `.clone/`, `.runtime/`, `WRITEUP.md`, `data/transactions.json` M, the spec and plan docs we just created). No unrelated staged work.

- [ ] **Step 2: Create the worktree**

Run: `git worktree add ../gasti-challenge.componentize-tool-results -b worktree-componentize-tool-results main`
Expected: `Preparing worktree (new branch 'worktree-componentize-tool-results')`. A sibling folder is created.

- [ ] **Step 3: Move to the worktree for subsequent work**

All remaining file paths in this plan are relative to the repo root, but every command runs in the worktree folder `../gasti-challenge.componentize-tool-results`. Install deps inside the worktree:

Run: `bun install`
Expected: dependencies resolved, no errors.

- [ ] **Step 4: Baseline build**

Run: `bun run build`
Expected: all three apps build green. If any app fails before we change anything, stop and surface the baseline failure to the user — do not proceed.

---

## Task 2: Allow `transform` to opt out by returning null

**Why:** Tools must be able to suppress their card when the result is empty (empty list, error envelope). The current `createGatewayTool` calls `config.transform!(output)` and always emits a display payload. We relax it.

**Files:**
- Modify: `apps/ai/src/shared/interface/create-gateway-tool.ts`

- [ ] **Step 1: Update the file**

Replace the body of `createGatewayTool` with:

```ts
import { createTool } from '@mastra/core/tools';
import type { ToolPayloadTransformContext } from '@mastra/core/tools';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import { ApiError, gatewayErrorSchema, isGatewayError } from '../domain/api-error';
import type { GatewayError } from '../domain/api-error';
import type { GatewayCtx } from '../domain/gateway-ctx';

interface GatewayToolConfig<TInput extends ZodTypeAny, TOutput extends ZodTypeAny> {
  id: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  call: (input: z.infer<TInput>, ctx: GatewayCtx) => Promise<z.infer<TOutput>>;
  /**
   * Map the gateway output to a UI attachment payload. Return `null` or
   * `undefined` to suppress the attachment (e.g. empty list, no data) — the
   * UI then renders only the agent's text.
   */
  transform?: (output: z.infer<TOutput>) => unknown | null | undefined;
}

/**
 * Builds a Mastra tool that parses input, calls one gateway method, and returns
 * the result. `userId` is read from requestContext (set by server middleware).
 *
 * The tool's `outputSchema` is the success schema *widened with* the gateway
 * error envelope: on an `ApiError` (or any transport failure) the tool returns
 * a structured `{ error, code, message }` object that still validates, so the
 * agent can narrate the failure honestly instead of fabricating an answer.
 */
export function createGatewayTool<TInput extends ZodTypeAny, TOutput extends ZodTypeAny>(
  config: GatewayToolConfig<TInput, TOutput>,
) {
  return createTool({
    id: config.id,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: z.union([config.outputSchema, gatewayErrorSchema]),
    ...(config.transform
      ? {
          transform: {
            display: {
              output: (ctx: ToolPayloadTransformContext) => {
                const output = ctx.output;
                // Error envelope: no attachment.
                if (isGatewayError(output)) return undefined;
                return config.transform!(output as z.infer<TOutput>) ?? undefined;
              },
            },
          },
        }
      : {}),
    execute: async (inputData, context): Promise<z.infer<TOutput> | GatewayError> => {
      const userId = (context?.requestContext?.get('userId') as string | undefined) ?? 'default-user';
      try {
        return await config.call(inputData as z.infer<TInput>, { userId });
      } catch (err) {
        if (err instanceof ApiError) {
          return { error: true, code: err.code, message: err.message };
        }
        return {
          error: true,
          code: 'UNREACHABLE',
          message: 'No pude consultar tus datos en este momento.',
        };
      }
    },
  });
}
```

Changes vs. current:
1. The `transform` type now allows `null | undefined`.
2. On a gateway-error envelope we return `undefined` instead of passing the error through as a display payload (errors stop producing cards entirely).
3. The transform result is coalesced with `?? undefined` so a `null` return is treated as "no attachment".

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ai`
Expected: `apps/ai` builds green.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/shared/interface/create-gateway-tool.ts
git commit -m "refactor(ai): allow gateway tool transform to suppress card via null"
```

---

## Task 3: Add `labelA` / `labelB` to compareSpending result

**Why:** The compare card needs human-readable period labels. The current `compareResult` carries totals and deltas but no labels — the transform would have to derive them from input, which leaks logic into the interface layer.

**Files:**
- Modify: `apps/api/src/spending/use-cases/compare.use-case.ts`
- Modify: `apps/ai/src/spending/domain/spending.gateway.ts`
- Modify: `apps/api/src/spending/use-cases/spending.use-cases.test.ts`

- [ ] **Step 1: Update the existing compare test to assert the new labels (RED)**

Open `apps/api/src/spending/use-cases/spending.use-cases.test.ts` and replace the existing `'compare reports per-category deltas between two periods'` test body with:

```ts
test('compare reports per-category deltas between two periods', async () => {
  const result = await new CompareSpending(fakeTransactionsRepo(seed), periods, categories).execute({
    periodA: { kind: 'month', month: '2026-04' },
    periodB: { kind: 'month', month: '2026-05' },
  });
  expect(result.totalA).toBe(9000);
  expect(result.totalB).toBe(12000);
  expect(result.labelA).toBe('Abril 2026');
  expect(result.labelB).toBe('Mayo 2026');
  const comida = result.categories.find((c) => c.category === 'comida');
  expect(comida).toEqual({ category: 'comida', totalA: 9000, totalB: 10000, delta: 1000, deltaPct: (1000 / 9000) * 100 });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run from repo root: `bun test apps/api/src/spending/use-cases/spending.use-cases.test.ts`
Expected: the `compare reports per-category deltas` test fails with something like `expected labelA to be 'Abril 2026' got undefined`. Other tests in the file still pass.

- [ ] **Step 3: Add a private period-label helper to the use-case**

Open `apps/api/src/spending/use-cases/compare.use-case.ts` and replace the whole file with:

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

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function labelFor(period: Period, range: DateRange): string {
  switch (period.kind) {
    case 'currentMonth':
    case 'month': {
      const ym = period.kind === 'month' ? period.month : range.from.slice(0, 7);
      const [y, m] = ym.split('-');
      return `${MONTH_NAMES_ES[Number(m) - 1]} ${y}`;
    }
    case 'lastNDays':
      return `Últimos ${period.n} días`;
    case 'customRange':
      return `${range.from} → ${range.to}`;
  }
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
    const rangeA = this.periods.resolve(input.periodA);
    const rangeB = this.periods.resolve(input.periodB);
    const sumByCat = (range: DateRange): Map<Category, number> => {
      const m = new Map<Category, number>();
      for (const t of txs) {
        if (t.date < range.from || t.date > range.to) continue;
        const c = cats.get(t.id)!;
        m.set(c, (m.get(c) ?? 0) + t.amount);
      }
      return m;
    };
    const a = sumByCat(rangeA);
    const b = sumByCat(rangeB);
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
      labelA: labelFor(input.periodA, rangeA),
      labelB: labelFor(input.periodB, rangeB),
      categories,
    };
  }
}
```

- [ ] **Step 4: Update the AI-side schema**

Open `apps/ai/src/spending/domain/spending.gateway.ts` and replace the `compareResult` block with:

```ts
export const compareResult = z.object({
  totalA: z.number(),
  totalB: z.number(),
  labelA: z.string(),
  labelB: z.string(),
  categories: z.array(
    z.object({
      category: categorySchema,
      totalA: z.number(),
      totalB: z.number(),
      delta: z.number(),
      deltaPct: z.number(),
    }),
  ),
});
```

(The two `string` lines are the only addition — leave the rest of the file untouched.)

- [ ] **Step 5: Verify the test now passes (GREEN)**

Run from repo root: `bun test apps/api/src/spending/use-cases/spending.use-cases.test.ts`
Expected: all tests pass, including the updated compare test.

- [ ] **Step 6: Full builds (both apps)**

Run: `bun run build --filter=api && bun run build --filter=ai`
Expected: both build green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/spending/use-cases/compare.use-case.ts apps/ai/src/spending/domain/spending.gateway.ts apps/api/src/spending/use-cases/spending.use-cases.test.ts
git commit -m "feat(api): emit period labelA/labelB from compare use-case"
```

---

## Task 4: Add shared `capitalize` helper to apps/ui

**Files:**
- Create: `apps/ui/src/shared/format/capitalize.ts`
- Modify: `apps/ui/src/budgets/components/budget-progress-card.tsx`

- [ ] **Step 1: Create the helper**

Write `apps/ui/src/shared/format/capitalize.ts`:

```ts
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
```

- [ ] **Step 2: Refactor budget-progress-card to use it**

In `apps/ui/src/budgets/components/budget-progress-card.tsx`:

1. Add the import at the top alongside the others:
   ```ts
   import { capitalize } from '@/shared/format/capitalize';
   ```
2. Replace the line
   ```ts
   const label = progress.category.charAt(0).toUpperCase() + progress.category.slice(1);
   ```
   with
   ```ts
   const label = capitalize(progress.category);
   ```

- [ ] **Step 3: Typecheck**

Run: `bun run build --filter=ui`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/shared/format/capitalize.ts apps/ui/src/budgets/components/budget-progress-card.tsx
git commit -m "refactor(ui): extract capitalize helper for category labels"
```

---

## Task 5: Extend `MessageAttachment` union

**Files:**
- Modify: `apps/ui/src/chat/domain/message.ts`

- [ ] **Step 1: Replace the union**

Open `apps/ui/src/chat/domain/message.ts` and replace the `MessageAttachment` definition with:

```ts
import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

export type ToolCall = {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
};

export type OptionPill = {
  id: string;
  label: string;
  intent?: 'confirm' | 'cancel';
};

export type StatTone = 'neutral' | 'caution' | 'over';

export type RankedItem = {
  label: string;
  value: number;
  share?: number;       // 0..1; renders a share bar when set
  sub?: string;
  icon?: string;        // category name; falls back to a generic tag
};

export type CompareRow = {
  label: string;
  a: number;
  b: number;
  delta: number;
  deltaPct: number;     // signed; "+12,5%" / "−4,1%"
};

export type BulletItem = {
  label: string;
  sub?: string;
  value?: number;
  icon?: string;
};

export type MessageAttachment =
  | { kind: 'transactionList'; items: Transaction[] }
  | { kind: 'budgetProgress'; progress: BudgetProgress; caption?: string }
  | { kind: 'optionPills'; options: OptionPill[]; resolved?: boolean; caption?: string }
  | { kind: 'stat'; label: string; value: number; caption?: string; tone?: StatTone }
  | { kind: 'rankedList'; title?: string; items: RankedItem[] }
  | { kind: 'compareList'; title?: string; periodA: string; periodB: string; rows: CompareRow[] }
  | { kind: 'bulletList'; title?: string; items: BulletItem[] };

export type UserMessage = {
  id: string;
  role: 'user';
  text: string;
  sentAt: string;
};

export type GastiMessage = {
  id: string;
  role: 'gasti';
  text: string;
  toolCalls?: ToolCall[];
  attachments?: MessageAttachment[];
  sentAt: string;
};

export type Message = UserMessage | GastiMessage;
```

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ui`
Expected: green. (No consumers reference the new kinds yet, so the union extension is additive.)

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/domain/message.ts
git commit -m "feat(ui): extend MessageAttachment with stat/rankedList/compareList/bulletList"
```

---

## Task 6: Implement `StatCard`

**Files:**
- Create: `apps/ui/src/shared/ui/stat-card.tsx`

- [ ] **Step 1: Create the component**

Write `apps/ui/src/shared/ui/stat-card.tsx`:

```tsx
import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import type { StatTone } from '@/chat/domain/message';

type StatCardProps = {
  label: string;
  value: number;
  caption?: string;
  tone?: StatTone;
};

const VALUE_TONE_CLASS: Record<StatTone, string> = {
  neutral: '',
  caution: 'text-warn',
  over: 'text-neg',
};

export function StatCard({ label, value, caption, tone = 'neutral' }: StatCardProps) {
  return (
    <Card variant="plain" radius="lg" className="p-s4 px-s5">
      <div className="font-display text-[12px] font-medium tracking-label text-ink-3">
        {label}
      </div>
      <div className="mt-s2">
        <Num value={value} size="xl" className={VALUE_TONE_CLASS[tone]} />
      </div>
      {caption && (
        <div className="mt-s2 font-display text-[12px] font-medium tracking-label text-ink-3">
          {caption}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ui`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/stat-card.tsx
git commit -m "feat(ui): add StatCard primitive"
```

---

## Task 7: Implement `RankedListCard`

**Files:**
- Create: `apps/ui/src/shared/ui/ranked-list-card.tsx`

- [ ] **Step 1: Create the component**

Write `apps/ui/src/shared/ui/ranked-list-card.tsx`:

```tsx
import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import { BarMeter } from '@/shared/ui/bar-meter';
import { CategoryIcon } from '@/shared/icons/category-icon';
import type { RankedItem } from '@/chat/domain/message';

type RankedListCardProps = {
  title?: string;
  items: RankedItem[];
};

export function RankedListCard({ title, items }: RankedListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      {title && (
        <div className="px-s4 pt-s3 font-display text-[12px] font-medium tracking-label text-ink-3">
          {title}
        </div>
      )}
      <ul>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {i > 0 && <div className="border-t border-line-1 ml-[62px] -mr-s3" aria-hidden />}
            <div className="flex items-start gap-s3 px-s3 py-s3">
              <span className="mt-[2px] flex h-9 w-9 items-center justify-center rounded-sm bg-surface-tint text-ai-ink">
                <CategoryIcon category={item.icon ?? 'otros'} size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-s2">
                  <span className="truncate font-display text-[15px] font-semibold text-ink-1">
                    {item.label}
                  </span>
                  <Num value={item.value} size="sm" />
                </div>
                {item.sub && (
                  <div className="mt-[2px] font-display text-[12px] font-medium tracking-label text-ink-3">
                    {item.sub}
                  </div>
                )}
                {typeof item.share === 'number' && (
                  <div className="mt-s2">
                    <BarMeter
                      value={item.share}
                      tone="pos"
                      animateOnMount={false}
                      ariaLabel={`Participación de ${item.label}`}
                    />
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ui`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/ranked-list-card.tsx
git commit -m "feat(ui): add RankedListCard primitive"
```

---

## Task 8: Implement `CompareListCard`

**Files:**
- Create: `apps/ui/src/shared/ui/compare-list-card.tsx`

- [ ] **Step 1: Create the component**

Write `apps/ui/src/shared/ui/compare-list-card.tsx`:

```tsx
import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import type { CompareRow } from '@/chat/domain/message';

type CompareListCardProps = {
  title?: string;
  periodA: string;
  periodB: string;
  rows: CompareRow[];
};

export function CompareListCard({ title, periodA, periodB, rows }: CompareListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      {title && (
        <div className="px-s4 pt-s3 font-display text-[12px] font-medium tracking-label text-ink-3">
          {title}
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-s3 px-s4 py-s2 font-display text-[11px] font-medium tracking-label text-ink-3">
        <span></span>
        <span className="text-right">{periodA}</span>
        <span className="text-right">{periodB}</span>
        <span className="text-right">Δ</span>
      </div>
      <ul>
        {rows.map((row, i) => (
          <li key={`${row.label}-${i}`}>
            {i > 0 && <div className="border-t border-line-1 mx-s4" aria-hidden />}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-s3 px-s4 py-s3">
              <span className="truncate font-display text-[14px] font-semibold text-ink-1">
                {row.label}
              </span>
              <Num value={row.a} size="sm" className="text-right" />
              <Num value={row.b} size="sm" className="text-right" />
              <Num value={row.deltaPct} size="sm" delta percent className="text-right" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ui`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/compare-list-card.tsx
git commit -m "feat(ui): add CompareListCard primitive"
```

---

## Task 9: Implement `BulletListCard`

**Files:**
- Create: `apps/ui/src/shared/ui/bullet-list-card.tsx`

- [ ] **Step 1: Create the component**

Write `apps/ui/src/shared/ui/bullet-list-card.tsx`:

```tsx
import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import { CategoryIcon } from '@/shared/icons/category-icon';
import type { BulletItem } from '@/chat/domain/message';

type BulletListCardProps = {
  title?: string;
  items: BulletItem[];
};

export function BulletListCard({ title, items }: BulletListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      {title && (
        <div className="px-s4 pt-s3 font-display text-[12px] font-medium tracking-label text-ink-3">
          {title}
        </div>
      )}
      <ul>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {i > 0 && <div className="border-t border-line-1 ml-[62px] -mr-s3" aria-hidden />}
            <div className="flex items-start gap-s3 px-s3 py-s3">
              <span className="mt-[2px] flex h-9 w-9 items-center justify-center rounded-sm bg-surface-tint text-ai-ink">
                <CategoryIcon category={item.icon ?? 'otros'} size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-s2">
                  <span className="truncate font-display text-[15px] font-semibold text-ink-1">
                    {item.label}
                  </span>
                  {typeof item.value === 'number' && <Num value={item.value} size="sm" />}
                </div>
                {item.sub && (
                  <div className="mt-[2px] font-display text-[12px] text-ink-2">
                    {item.sub}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ui`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/bullet-list-card.tsx
git commit -m "feat(ui): add BulletListCard primitive"
```

---

## Task 10: Wire the four new kinds in `MessageAttachments`

**Files:**
- Modify: `apps/ui/src/chat/components/message-attachments.tsx`

- [ ] **Step 1: Replace the file**

Write `apps/ui/src/chat/components/message-attachments.tsx`:

```tsx
'use client';

import { OptionPillStack } from '@/shared/ui/option-pill-stack';
import { TransactionListCard } from '@/transactions/components/transaction-list-card';
import { BudgetProgressCard } from '@/budgets/components/budget-progress-card';
import { StatCard } from '@/shared/ui/stat-card';
import { RankedListCard } from '@/shared/ui/ranked-list-card';
import { CompareListCard } from '@/shared/ui/compare-list-card';
import { BulletListCard } from '@/shared/ui/bullet-list-card';
import { useChat } from '@/chat/infrastructure/use-chat';
import type { MessageAttachment } from '@/chat/domain/message';

type MessageAttachmentsProps = {
  attachments: MessageAttachment[];
};

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const { pickOption } = useChat();

  return (
    <div className="mt-s3 flex flex-col gap-s3">
      {attachments.map((a, idx) => {
        if (a.kind === 'transactionList') {
          return <TransactionListCard key={idx} items={a.items} />;
        }
        if (a.kind === 'budgetProgress') {
          return <BudgetProgressCard key={idx} progress={a.progress} caption={a.caption} />;
        }
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
        if (a.kind === 'stat') {
          return <StatCard key={idx} label={a.label} value={a.value} caption={a.caption} tone={a.tone} />;
        }
        if (a.kind === 'rankedList') {
          return <RankedListCard key={idx} title={a.title} items={a.items} />;
        }
        if (a.kind === 'compareList') {
          return (
            <CompareListCard
              key={idx}
              title={a.title}
              periodA={a.periodA}
              periodB={a.periodB}
              rows={a.rows}
            />
          );
        }
        if (a.kind === 'bulletList') {
          return <BulletListCard key={idx} title={a.title} items={a.items} />;
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ui`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/message-attachments.tsx
git commit -m "feat(ui): render stat/rankedList/compareList/bulletList attachments"
```

---

## Task 11: Add transforms to spending tools

**Files:**
- Modify: `apps/ai/src/spending/interface/spending.tools.ts`

- [ ] **Step 1: Replace the file**

Write `apps/ai/src/spending/interface/spending.tools.ts`:

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/spending.gateway';
import type { SpendingGateway } from '../domain/spending.gateway';

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralMovements(n: number): string {
  return `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;
}

export function makeSpendingTools(gateway: SpendingGateway) {
  return {
    sumSpendByCategory: createGatewayTool({
      id: 'sumSpendByCategory',
      description: 'Total amount spent in one category over a period (ARS).',
      inputSchema: s.sumByCategoryInput,
      outputSchema: s.sumByCategoryResult,
      call: (i, c) => gateway.sumByCategory(i, c),
      transform: (output) =>
        output.transactionCount === 0
          ? null
          : {
              kind: 'stat',
              label: capitalize(output.category),
              value: output.total,
              caption: pluralMovements(output.transactionCount),
            },
    }),
    getSpendingBreakdown: createGatewayTool({
      id: 'getSpendingBreakdown',
      description: 'Ranked per-category spending breakdown over a period.',
      inputSchema: s.breakdownInput,
      outputSchema: s.breakdownResult,
      call: (i, c) => gateway.breakdown(i, c),
      transform: (output) =>
        output.breakdown.length === 0
          ? null
          : {
              kind: 'rankedList',
              items: output.breakdown.map((b) => ({
                label: capitalize(b.category),
                value: b.total,
                share: b.share,
                icon: b.category,
              })),
            },
    }),
    getTopMerchants: createGatewayTool({
      id: 'getTopMerchants',
      description: 'Merchants ranked by total spend over a period.',
      inputSchema: s.topMerchantsInput,
      outputSchema: s.topMerchantsResult,
      call: (i, c) => gateway.topMerchants(i, c),
      transform: (output) =>
        output.merchants.length === 0
          ? null
          : {
              kind: 'rankedList',
              items: output.merchants.map((m) => ({
                label: m.merchant,
                value: m.total,
                sub: `${m.transactionCount} ${m.transactionCount === 1 ? 'mov.' : 'movs.'}`,
              })),
            },
    }),
    listTransactions: createGatewayTool({
      id: 'listTransactions',
      description:
        'Filtered transaction lookup by merchant, one or more categories, and/or period. Omit categories to include all of them.',
      inputSchema: s.listTransactionsInput,
      outputSchema: s.listTransactionsResult,
      call: (i, c) => gateway.listTransactions(i, c),
      transform: (output) =>
        output.transactions.length === 0 ? null : { kind: 'transactionList', items: output.transactions },
    }),
    compareSpending: createGatewayTool({
      id: 'compareSpending',
      description: 'Compare spending between two periods with per-category deltas.',
      inputSchema: s.compareInput,
      outputSchema: s.compareResult,
      call: (i, c) => gateway.compare(i, c),
      transform: (output) =>
        output.categories.length === 0
          ? null
          : {
              kind: 'compareList',
              periodA: output.labelA,
              periodB: output.labelB,
              rows: output.categories.map((c) => ({
                label: capitalize(c.category),
                a: c.totalA,
                b: c.totalB,
                delta: c.delta,
                deltaPct: c.deltaPct,
              })),
            },
    }),
  };
}
```

Changes vs. current:
1. Added `capitalize` and `pluralMovements` helpers (local — apps/ai and apps/ui don't share a package).
2. Added `transform` to `sumSpendByCategory`, `getSpendingBreakdown`, `getTopMerchants`, `compareSpending`.
3. Tightened `listTransactions` transform: returns `null` when the list is empty (was always emitting an empty card).

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ai`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/spending/interface/spending.tools.ts
git commit -m "feat(ai): emit card attachments from spending tools"
```

---

## Task 12: Add transforms to insights tools

**Files:**
- Modify: `apps/ai/src/insights/interface/insights.tools.ts`

- [ ] **Step 1: Replace the file**

Write `apps/ai/src/insights/interface/insights.tools.ts`:

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/insights.gateway';
import type { InsightsGateway } from '../domain/insights.gateway';

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function makeInsightsTools(gateway: InsightsGateway) {
  return {
    projectMonthEnd: createGatewayTool({
      id: 'projectMonthEnd',
      description: 'Project where the current month ends from partial data; includes a caveat when the sample is thin.',
      inputSchema: s.projectMonthEndInput,
      outputSchema: s.projectMonthEndResult,
      call: (i, c) => gateway.projectMonthEnd(i, c),
      transform: (output) => ({
        kind: 'stat',
        label: 'Proyección de fin de mes',
        value: output.projectedTotal,
        caption: output.caveat ?? `Día ${output.daysElapsed} de ${output.daysInMonth}`,
        tone: 'neutral',
      }),
    }),
    detectRecurringCharges: createGatewayTool({
      id: 'detectRecurringCharges',
      description: 'Detect recurring, subscription-like charges across recent months.',
      inputSchema: s.recurringChargesInput,
      outputSchema: s.recurringChargesResult,
      call: (i, c) => gateway.recurringCharges(i, c),
      transform: (output) =>
        output.recurring.length === 0
          ? null
          : {
              kind: 'bulletList',
              items: output.recurring.map((r) => ({
                label: r.merchant,
                sub: `${capitalize(r.cadence)} · ${r.occurrences} cargo${r.occurrences === 1 ? '' : 's'}`,
                value: r.typicalAmount,
                icon: r.category,
              })),
            },
    }),
    detectCategorySpikes: createGatewayTool({
      id: 'detectCategorySpikes',
      description: 'Detect categories that jumped sharply versus the prior month.',
      inputSchema: s.categorySpikesInput,
      outputSchema: s.categorySpikesResult,
      call: (i, c) => gateway.categorySpikes(i, c),
      transform: (output) =>
        output.spikes.length === 0
          ? null
          : {
              kind: 'compareList',
              periodA: 'Mes anterior',
              periodB: 'Este mes',
              rows: output.spikes.map((sp) => ({
                label: capitalize(sp.category),
                a: sp.priorTotal,
                b: sp.currentTotal,
                delta: sp.delta,
                deltaPct: sp.deltaPct,
              })),
            },
    }),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ai`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/insights/interface/insights.tools.ts
git commit -m "feat(ai): emit card attachments from insights tools"
```

---

## Task 13: Add transforms to categorization tools

**Files:**
- Modify: `apps/ai/src/categorization/interface/categorization.tools.ts`

- [ ] **Step 1: Update the file**

Open `apps/ai/src/categorization/interface/categorization.tools.ts`. Add the helper near the top (below the imports, above `makeCategorizationTools`):

```ts
function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
```

Then replace the existing `listCategories` and `proposeCategoryChange` entries with:

```ts
    listCategories: createGatewayTool({
      id: 'listCategories',
      description: 'List every spending category — the seven defaults and any custom ones.',
      inputSchema: s.listCategoriesInput,
      outputSchema: s.listCategoriesResult,
      call: (i, c) => gateway.list(i, c),
      transform: (output) =>
        output.categories.length === 0
          ? null
          : {
              kind: 'bulletList',
              items: output.categories.map((c) => ({
                label: capitalize(c.name),
                sub: c.description || (c.isCustom ? 'Categoría personalizada' : 'Sin descripción'),
                icon: c.name,
              })),
            },
    }),
    proposeCategoryChange: createGatewayTool({
      id: 'proposeCategoryChange',
      description:
        'Read-only. MANDATORY first step for every custom-category delete or rename request — call it each time, even if you already know the affected-transaction count from earlier in the conversation. It renders the confirmation card the user acts on; skip it and there is no card. Returns the affected-transaction count. Never ask for delete/rename confirmation in plain text instead of calling this.',
      inputSchema: s.proposeCategoryChangeInput,
      outputSchema: s.proposeCategoryChangeResult,
      call: (i, c) => gateway.propose(i, c),
      transform: (output) => {
        const isDelete = output.intent === 'delete';
        const confirmLabel = isDelete ? 'Sí, borrala' : 'Sí, renombrala';
        const target = isDelete
          ? `delete:${output.name}`
          : `rename:${output.name}:${output.newName ?? ''}`;
        const affected = output.affectedTransactionCount;
        const caption = isDelete
          ? `Afecta ${affected} ${affected === 1 ? 'transacción' : 'transacciones'} (volverán a "otros")`
          : `Afecta ${affected} ${affected === 1 ? 'transacción' : 'transacciones'} · renombrar a "${output.newName ?? ''}"`;
        return {
          kind: 'optionPills',
          options: [
            { id: `confirm:${target}`, label: confirmLabel, intent: 'confirm' },
            { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
          ],
          caption,
        };
      },
    }),
```

(All other tool entries in this file stay unchanged.)

- [ ] **Step 2: Typecheck**

Run: `bun run build --filter=ai`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/categorization/interface/categorization.tools.ts
git commit -m "feat(ai): emit card attachments from category tools and fix proposeCategoryChange"
```

---

## Task 14: Update agent instructions

**Files:**
- Modify: `apps/ai/src/agent/instructions.ts`

- [ ] **Step 1: Replace the PRESENTATION section**

In `apps/ai/src/agent/instructions.ts`, find the block starting `PRESENTATION` (currently lines 75–79) and replace it with:

```
PRESENTATION
- The interface renders most tool results as rich cards. Never re-state the data the card shows.
- Cards rendered:
  · transactionList   (listTransactions, proposeTransactionMutation with N matches)
  · budgetProgress    (getBudgetProgress)
  · optionPills       (proposeTransactionMutation with 1 match, proposeCategoryChange)
  · stat              (sumSpendByCategory, projectMonthEnd)
  · rankedList        (getSpendingBreakdown, getTopMerchants)
  · compareList       (compareSpending, detectCategorySpikes)
  · bulletList        (detectRecurringCharges, listCategories)
- When you call one of these tools, reply with a single short headline sentence — the top number or the framing, never the items. No "abajo", "a continuación", "como se ve", "más detalles".
- For tools without a card (mutations, overrides, etc.), narrate the result normally.
```

The replacement keeps the same indentation style and surrounding `\n\n` boundaries as the existing block.

- [ ] **Step 2: Typecheck and run instructions test**

Run from repo root: `bun test apps/ai/src/agent/instructions.test.ts`
Expected: all passing. If the test snapshots the old PRESENTATION text and now fails, update the expected text in the test to match the new section verbatim, and rerun.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/agent/instructions.ts apps/ai/src/agent/instructions.test.ts
git commit -m "feat(ai): update PRESENTATION instructions for new card kinds"
```

(If the test file did not need changes, drop it from `git add`.)

---

## Task 15: End-to-end build + manual QA

**Files:** none

- [ ] **Step 1: Full build**

Run from repo root: `bun run build`
Expected: all three apps build green.

- [ ] **Step 2: Run tests**

Run: `bun test`
Expected: green across api (the only workspace with tests).

- [ ] **Step 3: Start dev servers**

Run: `bun dev`
Expected: api at `http://localhost:3001/health`, ui at `http://localhost:3000`, ai dev playground at `http://localhost:4111`. (Mastra dev binds 4111 per memory.)

- [ ] **Step 4: Manual QA in the chat (`http://localhost:3000`)**

For each prompt, confirm: card renders, the agent text is one headline sentence, and the card shows the expected data.

| Prompt | Expected card | Notes |
|---|---|---|
| `¿cuánto gasté en comida este mes?` | `stat` — Comida, total, "N movimientos" | If 0 movs → no card. |
| `desglosá mis gastos de mayo 2026` | `rankedList` with share bars | Ordered desc. |
| `top 5 merchants del mes` | `rankedList` without share bars (sub: "N movs.") | |
| `compará abril vs mayo 2026` | `compareList` with "Abril 2026" / "Mayo 2026" headers, signed % deltas | |
| `¿qué saltó este mes?` | `compareList` from spikes (or no card if no spikes) | |
| `¿qué suscripciones tengo?` | `bulletList` cadence + amount | |
| `qué categorías hay?` | `bulletList` of categories + description | |
| `proyectame fin de mes` | `stat` with caveat caption | |
| `¿cómo voy con comida?` | `budgetProgress` (existing card) | regression check |
| `mostrame las transacciones de Rappi en mayo 2026` | `transactionList` (existing) | regression check |
| `borrá la categoría tarjetas` (assuming exists) | `optionPills` with caption "Afecta N transacciones..." | new behavior |
| `borrá txn_001` | `optionPills` confirm/cancel (existing path) | regression check |

- [ ] **Step 5: Note any visual issues**

If a card renders wrong (overflow, spacing, contrast, dark-mode glitches), file the issue in the user message; defer fixes to a follow-up unless trivial.

- [ ] **Step 6: Stop dev servers**

Ctrl+C in the `bun dev` terminal.

---

## Task 16: Finish the branch

**Files:** none

- [ ] **Step 1: Verify branch state**

Run from the worktree: `git log --oneline main..HEAD`
Expected: ~12 single-line commits matching the per-task commits above (refactor/feat scopes).

- [ ] **Step 2: Hand off to finishing-a-development-branch**

Surface to the user: tests pass, manual QA done, present the merge/PR/keep/discard options via `superpowers:finishing-a-development-branch`.

---

## Self-review checklist

**Spec coverage:**
- 4 primitive components — Tasks 6–9 ✓
- 4 new attachment kinds in the union — Task 5 ✓
- Empty/error → no card rule (transform returns null suppressed) — Task 2 ✓
- `compareResult` extended with `labelA`/`labelB` plus use-case + test update — Task 3 ✓
- Transforms added to all 8 tools + `proposeCategoryChange` fix — Tasks 11–13 ✓
- Agent instructions updated — Task 14 ✓
- Shared capitalize helper + refactor of existing card — Task 4 ✓
- Verification plan executed — Task 15 ✓

**Placeholders:** none. All code blocks are complete.

**Type consistency:** attachment kinds (`stat`, `rankedList`, `compareList`, `bulletList`) match across `message.ts`, every component file, every transform, and the agent instructions. Field names (`label`, `value`, `share`, `sub`, `icon`, `a`, `b`, `delta`, `deltaPct`, `periodA`, `periodB`, `rows`, `items`, `title`, `caption`, `tone`) consistent across union, transforms, and components.

**Risks called out:**
- `instructions.test.ts` may or may not snapshot the PRESENTATION block — Task 14 handles both cases.
- Mastra version `@mastra/core ^1.33` — confirm `transform.display.output` accepts `undefined` as "no display payload"; if it throws, fall back to wrapping in `{ kind: 'none' }` and filtering in `MessageAttachments`.
