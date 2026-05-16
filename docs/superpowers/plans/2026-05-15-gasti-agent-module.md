# Gasti Agent Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the conversational Gasti agent in `apps/ai` — a single Mastra `Agent` with 24 thin tools that call `apps/api` over HTTP — delivering spending Q&A, insights, budget coaching, savings-goal coaching, and transaction CRUD.

**Architecture:** Clean Architecture in `apps/ai` as a thin adapter layer. `domain/` holds Zod schemas + gateway interfaces; `providers/` holds HTTP gateway implementations; `interface/` holds Mastra tools; `infrastructure/` (the `mastra/` registry + `agent/`) is the composition root. Tools are wired by DI factories. No business logic lives here — it lives in `apps/api` behind the HTTP contract pinned in the spec.

**Tech Stack:** Mastra `@mastra/core` 1.33 (`Agent`, `createTool`), `@ai-sdk/openai`, Zod 3, Bun, TypeScript.

**Reference spec:** `docs/superpowers/specs/2026-05-15-gasti-agent-module-design.md` — read it before starting.

### Testing note

Per `PRODUCT.md` (§Testing Decisions) and `CLAUDE.md`, **tests are not a deliverable**, and PRODUCT.md explicitly says not to unit-test Mastra tools or the agent. This plan therefore deviates from the writing-plans skill's TDD template: each task's verification step is a **type-check** (`bunx tsc --noEmit -p apps/ai/tsconfig.json`), and the final task is a **manual Mastra Studio walkthrough**. This is a deliberate, instruction-driven deviation, not an omission.

### Integration seams (other worktrees / sibling specs)

- **Memory** is built in a parallel worktree. `makeGastiAgent` accepts an optional `memory`; this plan passes `undefined`. When the memory worktree merges, one line in `mastra/index.ts` changes.
- **libSQL storage** is a separate approved spec. This plan does not add `storage` to the `Mastra` registry. If that spec has already merged, keep its `storage:` line when editing `mastra/index.ts`.
- **`apps/api`** endpoints are a sibling spec. Tier-2 verification (Task 13) requires `apps/api` running; Tier-1 does not.

---

## File Structure

```
apps/ai/src/
├── mastra/index.ts                         MODIFY  composition root + server middleware
├── agent/
│   ├── gasti-agent.ts                      CREATE  makeGastiAgent factory
│   └── instructions.ts                     CREATE  buildInstructions(requestContext)
├── shared/
│   ├── domain/
│   │   ├── category.ts                     CREATE  Category enum
│   │   ├── period.ts                       CREATE  Period union
│   │   ├── transaction.ts                  CREATE  Transaction
│   │   ├── goal.ts                         CREATE  Goal
│   │   ├── gateway-ctx.ts                  CREATE  GatewayCtx
│   │   └── api-error.ts                    CREATE  ApiError
│   ├── providers/
│   │   ├── api-client.ts                   CREATE  typed POST wrapper
│   │   └── make-http-gateway.ts            CREATE  generic route-map gateway factory
│   └── interface/create-gateway-tool.ts    CREATE  shared tool factory helper
├── spending/        domain/ providers/ interface/   CREATE  gateway + 5 tools
├── insights/        domain/ providers/ interface/   CREATE  gateway + 3 tools
├── budgets/         domain/ providers/ interface/   CREATE  gateway + 3 tools
├── income/          domain/ providers/ interface/   CREATE  gateway + 2 tools
├── categorization/  domain/ providers/ interface/   CREATE  gateway + 2 tools
├── transactions/    domain/ providers/ interface/   CREATE  gateway + 4 tools
└── goals/           domain/ providers/ interface/   CREATE  gateway + 5 tools
```

The old `apps/ai/src/mastra/agents/index.ts` (placeholder agent) is deleted in Task 12.

**Shared helpers (DRY) note:** the spec keeps gateway interfaces in `domain/`, HTTP implementations in `providers/`, and per-tool / per-gateway factories. Two layers are pure boilerplate: every tool is *parse input → call one gateway method → return*, and every HTTP gateway method is *one `api.post`*. This plan introduces two shared helpers — `createGatewayTool` (each tool factory delegates to it) and `makeHttpGateway` (a generic route-map factory each HTTP gateway delegates to). The gateway interfaces stay in `domain/` (contract intact), the generic factory is a `providers/` implementation, DI is unchanged — CA-friendly. This is an implementation-level DRY decision consistent with the spec ("tools are thin") and CLAUDE.md ("DRY"). The named `make<Name>Tool` / `makeHttp<Name>Gateway` factories still exist.

---

## Task 1: Shared domain types

**Files:**
- Create: `apps/ai/src/shared/domain/category.ts`
- Create: `apps/ai/src/shared/domain/period.ts`
- Create: `apps/ai/src/shared/domain/transaction.ts`
- Create: `apps/ai/src/shared/domain/goal.ts`
- Create: `apps/ai/src/shared/domain/gateway-ctx.ts`
- Create: `apps/ai/src/shared/domain/api-error.ts`

- [ ] **Step 1: Create `category.ts`**

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
```

- [ ] **Step 2: Create `period.ts`**

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
```

- [ ] **Step 3: Create `transaction.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from './category';

export const transactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number(),
  currency: z.literal('ARS'),
  category: categorySchema,
  description: z.string(),
  merchant: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;
```

- [ ] **Step 4: Create `goal.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from './category';

export const goalSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetAmount: z.number().positive(),
  targetDate: z.string(),
  linkedCategory: categorySchema.nullable(),
});

export type Goal = z.infer<typeof goalSchema>;
```

- [ ] **Step 5: Create `gateway-ctx.ts`**

```ts
export interface GatewayCtx {
  readonly userId: string;
}
```

- [ ] **Step 6: Create `api-error.ts`**

```ts
export interface ApiErrorEnvelope {
  error: { code: string; message: string };
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorEnvelope).error?.code === 'string'
  );
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0, no output.

- [ ] **Step 8: Commit**

```bash
git add apps/ai/src/shared/domain
git commit -m "feat(ai): shared domain types for the agent module"
```

---

## Task 2: Shared providers & tool helper

**Files:**
- Create: `apps/ai/src/shared/providers/api-client.ts`
- Create: `apps/ai/src/shared/providers/make-http-gateway.ts`
- Create: `apps/ai/src/shared/interface/create-gateway-tool.ts`

- [ ] **Step 1: Create `api-client.ts`**

```ts
import { ApiError, isApiErrorEnvelope } from '../domain/api-error';
import type { GatewayCtx } from '../domain/gateway-ctx';

const DEFAULT_BASE_URL = 'http://localhost:3001';
const RETRY_DELAY_MS = 300;

export interface ApiClient {
  post<TOut>(path: string, body: unknown, ctx: GatewayCtx): Promise<TOut>;
}

export function makeApiClient(
  baseUrl: string = process.env.API_BASE_URL ?? DEFAULT_BASE_URL,
): ApiClient {
  async function attempt<TOut>(path: string, body: unknown, ctx: GatewayCtx): Promise<TOut> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': ctx.userId },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = isApiErrorEnvelope(json) ? json.error.code : 'HTTP_ERROR';
      const message = isApiErrorEnvelope(json) ? json.error.message : `HTTP ${res.status}`;
      throw new ApiError(code, message, res.status);
    }
    return json as TOut;
  }

  return {
    async post<TOut>(path: string, body: unknown, ctx: GatewayCtx): Promise<TOut> {
      try {
        return await attempt<TOut>(path, body, ctx);
      } catch (err) {
        const retryable = !(err instanceof ApiError) || err.status >= 500;
        if (!retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return attempt<TOut>(path, body, ctx);
      }
    },
  };
}
```

- [ ] **Step 2: Create `make-http-gateway.ts`**

```ts
import type { ApiClient } from './api-client';
import type { GatewayCtx } from '../domain/gateway-ctx';

/**
 * Builds an HTTP gateway implementation from a declarative route map.
 * Every gateway method is `api.post(path, input, ctx)`, so a gateway interface
 * is satisfied by mapping each method name to its endpoint path.
 * `Record<keyof G, string>` makes a missing route a compile error.
 */
export function makeHttpGateway<G extends object>(
  api: ApiClient,
  routes: Record<keyof G, string>,
): G {
  const gateway: Record<string, unknown> = {};
  for (const key of Object.keys(routes) as (keyof G)[]) {
    const path = routes[key];
    gateway[key as string] = (input: unknown, ctx: GatewayCtx) => api.post(path, input, ctx);
  }
  return gateway as G;
}
```

- [ ] **Step 3: Create `create-gateway-tool.ts`**

```ts
import { createTool } from '@mastra/core/tools';
import type { ZodTypeAny, z } from 'zod';
import { ApiError } from '../domain/api-error';
import type { GatewayCtx } from '../domain/gateway-ctx';

interface GatewayToolConfig<TInput extends ZodTypeAny, TOutput extends ZodTypeAny> {
  id: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  call: (input: z.infer<TInput>, ctx: GatewayCtx) => Promise<z.infer<TOutput>>;
  transform?: (output: z.infer<TOutput>) => unknown;
}

/**
 * Builds a Mastra tool that parses input, calls one gateway method, and returns
 * the result. `userId` is read from requestContext (set by server middleware).
 * On an ApiError it returns a structured error object so the agent can narrate
 * it honestly instead of fabricating an answer.
 */
export function createGatewayTool<TInput extends ZodTypeAny, TOutput extends ZodTypeAny>(
  config: GatewayToolConfig<TInput, TOutput>,
) {
  return createTool({
    id: config.id,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    ...(config.transform
      ? { transform: { display: { output: ({ output }: { output: z.infer<TOutput> }) => config.transform!(output) } } }
      : {}),
    execute: async (inputData, context) => {
      const userId = (context?.requestContext?.get('userId') as string | undefined) ?? 'default-user';
      try {
        return await config.call(inputData as z.infer<TInput>, { userId });
      } catch (err) {
        if (err instanceof ApiError) {
          return { error: true, code: err.code, message: err.message } as unknown as z.infer<TOutput>;
        }
        return {
          error: true,
          code: 'UNREACHABLE',
          message: 'No pude consultar tus datos en este momento.',
        } as unknown as z.infer<TOutput>;
      }
    },
  });
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0. If `transform`'s callback type does not match, consult the Mastra MCP (`reference/tools/create-tool`) for the exact `ToolPayloadTransform` shape and adjust the `transform` wiring only.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/shared/providers apps/ai/src/shared/interface
git commit -m "feat(ai): api client, http-gateway factory, and tool helper"
```

---

## Task 3: Spending feature (gateway + 5 tools)

**Files:**
- Create: `apps/ai/src/spending/domain/spending.gateway.ts`
- Create: `apps/ai/src/spending/providers/http-spending.gateway.ts`
- Create: `apps/ai/src/spending/interface/spending.tools.ts`

- [ ] **Step 1: Create `spending.gateway.ts`** (schemas, inferred types, interface)

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';
import { transactionSchema } from '../../shared/domain/transaction';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const sumByCategoryInput = z.object({ category: categorySchema, period: periodSchema });
export const sumByCategoryResult = z.object({
  category: categorySchema,
  total: z.number(),
  transactionCount: z.number().int(),
});

export const breakdownInput = z.object({ period: periodSchema });
export const breakdownResult = z.object({
  total: z.number(),
  breakdown: z.array(z.object({ category: categorySchema, total: z.number(), share: z.number() })),
});

export const topMerchantsInput = z.object({ period: periodSchema, limit: z.number().int().positive().optional() });
export const topMerchantsResult = z.object({
  merchants: z.array(z.object({ merchant: z.string(), total: z.number(), transactionCount: z.number().int() })),
});

export const listTransactionsInput = z.object({
  merchant: z.string().optional(),
  category: categorySchema.optional(),
  period: periodSchema,
  limit: z.number().int().positive().optional(),
});
export const listTransactionsResult = z.object({
  transactions: z.array(transactionSchema),
  total: z.number(),
});

export const compareInput = z.object({ periodA: periodSchema, periodB: periodSchema });
export const compareResult = z.object({
  totalA: z.number(),
  totalB: z.number(),
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

export type SumByCategoryInput = z.infer<typeof sumByCategoryInput>;
export type SumByCategoryResult = z.infer<typeof sumByCategoryResult>;
export type BreakdownInput = z.infer<typeof breakdownInput>;
export type BreakdownResult = z.infer<typeof breakdownResult>;
export type TopMerchantsInput = z.infer<typeof topMerchantsInput>;
export type TopMerchantsResult = z.infer<typeof topMerchantsResult>;
export type ListTransactionsInput = z.infer<typeof listTransactionsInput>;
export type ListTransactionsResult = z.infer<typeof listTransactionsResult>;
export type CompareInput = z.infer<typeof compareInput>;
export type CompareResult = z.infer<typeof compareResult>;

export interface SpendingGateway {
  sumByCategory(input: SumByCategoryInput, ctx: GatewayCtx): Promise<SumByCategoryResult>;
  breakdown(input: BreakdownInput, ctx: GatewayCtx): Promise<BreakdownResult>;
  topMerchants(input: TopMerchantsInput, ctx: GatewayCtx): Promise<TopMerchantsResult>;
  listTransactions(input: ListTransactionsInput, ctx: GatewayCtx): Promise<ListTransactionsResult>;
  compare(input: CompareInput, ctx: GatewayCtx): Promise<CompareResult>;
}
```

- [ ] **Step 2: Create `http-spending.gateway.ts`**

```ts
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { SpendingGateway } from '../domain/spending.gateway';

export function makeHttpSpendingGateway(api: ApiClient): SpendingGateway {
  return makeHttpGateway<SpendingGateway>(api, {
    sumByCategory: '/spending/sum-by-category',
    breakdown: '/spending/breakdown',
    topMerchants: '/spending/top-merchants',
    listTransactions: '/spending/list-transactions',
    compare: '/spending/compare',
  });
}
```

- [ ] **Step 3: Create `spending.tools.ts`**

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/spending.gateway';
import type { SpendingGateway } from '../domain/spending.gateway';

export function makeSpendingTools(gateway: SpendingGateway) {
  return {
    sumSpendByCategory: createGatewayTool({
      id: 'sumSpendByCategory',
      description: 'Total amount spent in one category over a period (ARS).',
      inputSchema: s.sumByCategoryInput,
      outputSchema: s.sumByCategoryResult,
      call: (i, c) => gateway.sumByCategory(i, c),
    }),
    getSpendingBreakdown: createGatewayTool({
      id: 'getSpendingBreakdown',
      description: 'Ranked per-category spending breakdown over a period.',
      inputSchema: s.breakdownInput,
      outputSchema: s.breakdownResult,
      call: (i, c) => gateway.breakdown(i, c),
    }),
    getTopMerchants: createGatewayTool({
      id: 'getTopMerchants',
      description: 'Merchants ranked by total spend over a period.',
      inputSchema: s.topMerchantsInput,
      outputSchema: s.topMerchantsResult,
      call: (i, c) => gateway.topMerchants(i, c),
    }),
    listTransactions: createGatewayTool({
      id: 'listTransactions',
      description: 'Filtered transaction lookup by merchant, category, and/or period.',
      inputSchema: s.listTransactionsInput,
      outputSchema: s.listTransactionsResult,
      call: (i, c) => gateway.listTransactions(i, c),
      transform: (output) => ({ kind: 'transactionList', items: output.transactions }),
    }),
    compareSpending: createGatewayTool({
      id: 'compareSpending',
      description: 'Compare spending between two periods with per-category deltas.',
      inputSchema: s.compareInput,
      outputSchema: s.compareResult,
      call: (i, c) => gateway.compare(i, c),
    }),
  };
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/spending
git commit -m "feat(ai): spending gateway and Q&A tools"
```

---

## Task 4: Insights feature (gateway + 3 tools)

**Files:**
- Create: `apps/ai/src/insights/domain/insights.gateway.ts`
- Create: `apps/ai/src/insights/providers/http-insights.gateway.ts`
- Create: `apps/ai/src/insights/interface/insights.tools.ts`

- [ ] **Step 1: Create `insights.gateway.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const projectMonthEndInput = z.object({ category: categorySchema.optional() });
export const projectMonthEndResult = z.object({
  daysElapsed: z.number().int(),
  daysInMonth: z.number().int(),
  spentSoFar: z.number(),
  projectedTotal: z.number(),
  caveat: z.string().nullable(),
});

export const recurringChargesInput = z.object({ lookbackMonths: z.number().int().positive().optional() });
export const recurringChargesResult = z.object({
  recurring: z.array(
    z.object({
      merchant: z.string(),
      category: categorySchema,
      typicalAmount: z.number(),
      cadence: z.string(),
      occurrences: z.number().int(),
      lastSeen: z.string(),
    }),
  ),
});

export const categorySpikesInput = z.object({});
export const categorySpikesResult = z.object({
  spikes: z.array(
    z.object({
      category: categorySchema,
      currentTotal: z.number(),
      priorTotal: z.number(),
      delta: z.number(),
      deltaPct: z.number(),
    }),
  ),
});

export type ProjectMonthEndInput = z.infer<typeof projectMonthEndInput>;
export type ProjectMonthEndResult = z.infer<typeof projectMonthEndResult>;
export type RecurringChargesInput = z.infer<typeof recurringChargesInput>;
export type RecurringChargesResult = z.infer<typeof recurringChargesResult>;
export type CategorySpikesInput = z.infer<typeof categorySpikesInput>;
export type CategorySpikesResult = z.infer<typeof categorySpikesResult>;

export interface InsightsGateway {
  projectMonthEnd(input: ProjectMonthEndInput, ctx: GatewayCtx): Promise<ProjectMonthEndResult>;
  recurringCharges(input: RecurringChargesInput, ctx: GatewayCtx): Promise<RecurringChargesResult>;
  categorySpikes(input: CategorySpikesInput, ctx: GatewayCtx): Promise<CategorySpikesResult>;
}
```

- [ ] **Step 2: Create `http-insights.gateway.ts`**

```ts
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { InsightsGateway } from '../domain/insights.gateway';

export function makeHttpInsightsGateway(api: ApiClient): InsightsGateway {
  return makeHttpGateway<InsightsGateway>(api, {
    projectMonthEnd: '/insights/project-month-end',
    recurringCharges: '/insights/recurring-charges',
    categorySpikes: '/insights/category-spikes',
  });
}
```

- [ ] **Step 3: Create `insights.tools.ts`**

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/insights.gateway';
import type { InsightsGateway } from '../domain/insights.gateway';

export function makeInsightsTools(gateway: InsightsGateway) {
  return {
    projectMonthEnd: createGatewayTool({
      id: 'projectMonthEnd',
      description: 'Project where the current month ends from partial data; includes a caveat when the sample is thin.',
      inputSchema: s.projectMonthEndInput,
      outputSchema: s.projectMonthEndResult,
      call: (i, c) => gateway.projectMonthEnd(i, c),
    }),
    detectRecurringCharges: createGatewayTool({
      id: 'detectRecurringCharges',
      description: 'Detect recurring, subscription-like charges across recent months.',
      inputSchema: s.recurringChargesInput,
      outputSchema: s.recurringChargesResult,
      call: (i, c) => gateway.recurringCharges(i, c),
    }),
    detectCategorySpikes: createGatewayTool({
      id: 'detectCategorySpikes',
      description: 'Detect categories that jumped sharply versus the prior month.',
      inputSchema: s.categorySpikesInput,
      outputSchema: s.categorySpikesResult,
      call: (i, c) => gateway.categorySpikes(i, c),
    }),
  };
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/insights
git commit -m "feat(ai): insights gateway and proactive-insight tools"
```

---

## Task 5: Budgets feature (gateway + 3 tools)

**Files:**
- Create: `apps/ai/src/budgets/domain/budgets.gateway.ts`
- Create: `apps/ai/src/budgets/providers/http-budgets.gateway.ts`
- Create: `apps/ai/src/budgets/interface/budgets.tools.ts`

- [ ] **Step 1: Create `budgets.gateway.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const setBudgetInput = z.object({ category: categorySchema, amount: z.number().positive() });
export const setBudgetResult = z.object({
  category: categorySchema,
  amount: z.number(),
  month: z.string(),
});

export const clearBudgetInput = z.object({ category: categorySchema });
export const clearBudgetResult = z.object({ category: categorySchema, cleared: z.boolean() });

export const budgetProgressInput = z.object({ category: categorySchema.optional() });
export const budgetProgressResult = z.object({
  items: z.array(
    z.object({
      category: categorySchema,
      budget: z.number(),
      spent: z.number(),
      remaining: z.number(),
      pace: z.enum(['under', 'on', 'over']),
      projected: z.number(),
    }),
  ),
});

export type SetBudgetInput = z.infer<typeof setBudgetInput>;
export type SetBudgetResult = z.infer<typeof setBudgetResult>;
export type ClearBudgetInput = z.infer<typeof clearBudgetInput>;
export type ClearBudgetResult = z.infer<typeof clearBudgetResult>;
export type BudgetProgressInput = z.infer<typeof budgetProgressInput>;
export type BudgetProgressResult = z.infer<typeof budgetProgressResult>;

export interface BudgetsGateway {
  setBudget(input: SetBudgetInput, ctx: GatewayCtx): Promise<SetBudgetResult>;
  clearBudget(input: ClearBudgetInput, ctx: GatewayCtx): Promise<ClearBudgetResult>;
  progress(input: BudgetProgressInput, ctx: GatewayCtx): Promise<BudgetProgressResult>;
}
```

- [ ] **Step 2: Create `http-budgets.gateway.ts`**

```ts
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { BudgetsGateway } from '../domain/budgets.gateway';

export function makeHttpBudgetsGateway(api: ApiClient): BudgetsGateway {
  return makeHttpGateway<BudgetsGateway>(api, {
    setBudget: '/budgets/set',
    clearBudget: '/budgets/clear',
    progress: '/budgets/progress',
  });
}
```

- [ ] **Step 3: Create `budgets.tools.ts`**

The `getBudgetProgress` transform maps the first item to the UI's singular `budgetProgress` attachment; when several budgets are returned the agent narrates them and the attachment shows the first.

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/budgets.gateway';
import type { BudgetsGateway } from '../domain/budgets.gateway';

export function makeBudgetsTools(gateway: BudgetsGateway) {
  return {
    setBudget: createGatewayTool({
      id: 'setBudget',
      description: 'Set or update the monthly budget for a category (ARS).',
      inputSchema: s.setBudgetInput,
      outputSchema: s.setBudgetResult,
      call: (i, c) => gateway.setBudget(i, c),
    }),
    clearBudget: createGatewayTool({
      id: 'clearBudget',
      description: 'Remove the monthly budget for a category.',
      inputSchema: s.clearBudgetInput,
      outputSchema: s.clearBudgetResult,
      call: (i, c) => gateway.clearBudget(i, c),
    }),
    getBudgetProgress: createGatewayTool({
      id: 'getBudgetProgress',
      description: 'Current spend versus budget and on-track-at-pace status. Omit category for all budgets.',
      inputSchema: s.budgetProgressInput,
      outputSchema: s.budgetProgressResult,
      call: (i, c) => gateway.progress(i, c),
      transform: (output) => ({ kind: 'budgetProgress', progress: output.items[0] ?? null }),
    }),
  };
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/budgets
git commit -m "feat(ai): budgets gateway and coaching tools"
```

---

## Task 6: Income feature (gateway + 2 tools)

**Files:**
- Create: `apps/ai/src/income/domain/income.gateway.ts`
- Create: `apps/ai/src/income/providers/http-income.gateway.ts`
- Create: `apps/ai/src/income/interface/income.tools.ts`

- [ ] **Step 1: Create `income.gateway.ts`**

```ts
import { z } from 'zod';
import { periodSchema } from '../../shared/domain/period';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const declareIncomeInput = z.object({
  kind: z.enum(['recurring', 'oneOff']),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});
export const declareIncomeResult = z.object({
  kind: z.enum(['recurring', 'oneOff']),
  amount: z.number(),
  date: z.string().nullable(),
  description: z.string().nullable(),
});

export const cashFlowInput = z.object({ period: periodSchema });
export const cashFlowResult = z.object({
  income: z.number(),
  expenses: z.number(),
  net: z.number(),
  savingsRate: z.number().nullable(),
});

export type DeclareIncomeInput = z.infer<typeof declareIncomeInput>;
export type DeclareIncomeResult = z.infer<typeof declareIncomeResult>;
export type CashFlowInput = z.infer<typeof cashFlowInput>;
export type CashFlowResult = z.infer<typeof cashFlowResult>;

export interface IncomeGateway {
  declareIncome(input: DeclareIncomeInput, ctx: GatewayCtx): Promise<DeclareIncomeResult>;
  cashFlow(input: CashFlowInput, ctx: GatewayCtx): Promise<CashFlowResult>;
}
```

- [ ] **Step 2: Create `http-income.gateway.ts`**

```ts
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { IncomeGateway } from '../domain/income.gateway';

export function makeHttpIncomeGateway(api: ApiClient): IncomeGateway {
  return makeHttpGateway<IncomeGateway>(api, {
    declareIncome: '/income/declare',
    cashFlow: '/income/cash-flow',
  });
}
```

- [ ] **Step 3: Create `income.tools.ts`**

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/income.gateway';
import type { IncomeGateway } from '../domain/income.gateway';

export function makeIncomeTools(gateway: IncomeGateway) {
  return {
    declareIncome: createGatewayTool({
      id: 'declareIncome',
      description: 'Record income — a recurring monthly figure or a one-off entry (ARS).',
      inputSchema: s.declareIncomeInput,
      outputSchema: s.declareIncomeResult,
      call: (i, c) => gateway.declareIncome(i, c),
    }),
    getCashFlow: createGatewayTool({
      id: 'getCashFlow',
      description: 'Net cash flow (income minus expenses) and approximate savings rate for a period.',
      inputSchema: s.cashFlowInput,
      outputSchema: s.cashFlowResult,
      call: (i, c) => gateway.cashFlow(i, c),
    }),
  };
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/income
git commit -m "feat(ai): income gateway and cash-flow tools"
```

---

## Task 7: Categorization feature (gateway + 2 tools)

**Files:**
- Create: `apps/ai/src/categorization/domain/categorization.gateway.ts`
- Create: `apps/ai/src/categorization/providers/http-categorization.gateway.ts`
- Create: `apps/ai/src/categorization/interface/categorization.tools.ts`

- [ ] **Step 1: Create `categorization.gateway.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const overrideMerchantInput = z.object({ merchant: z.string(), category: categorySchema });
export const overrideMerchantResult = z.object({ merchant: z.string(), category: categorySchema });

export const overrideTransactionInput = z.object({ transactionId: z.string(), category: categorySchema });
export const overrideTransactionResult = z.object({ transactionId: z.string(), category: categorySchema });

export type OverrideMerchantInput = z.infer<typeof overrideMerchantInput>;
export type OverrideMerchantResult = z.infer<typeof overrideMerchantResult>;
export type OverrideTransactionInput = z.infer<typeof overrideTransactionInput>;
export type OverrideTransactionResult = z.infer<typeof overrideTransactionResult>;

export interface CategorizationGateway {
  overrideMerchant(input: OverrideMerchantInput, ctx: GatewayCtx): Promise<OverrideMerchantResult>;
  overrideTransaction(input: OverrideTransactionInput, ctx: GatewayCtx): Promise<OverrideTransactionResult>;
}
```

- [ ] **Step 2: Create `http-categorization.gateway.ts`**

```ts
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { CategorizationGateway } from '../domain/categorization.gateway';

export function makeHttpCategorizationGateway(api: ApiClient): CategorizationGateway {
  return makeHttpGateway<CategorizationGateway>(api, {
    overrideMerchant: '/categorization/merchant',
    overrideTransaction: '/categorization/transaction',
  });
}
```

- [ ] **Step 3: Create `categorization.tools.ts`**

```ts
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
  };
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/categorization
git commit -m "feat(ai): categorization gateway and override tools"
```

---

## Task 8: Transactions feature (gateway + 4 tools)

**Files:**
- Create: `apps/ai/src/transactions/domain/transactions.gateway.ts`
- Create: `apps/ai/src/transactions/providers/http-transactions.gateway.ts`
- Create: `apps/ai/src/transactions/interface/transactions.tools.ts`

- [ ] **Step 1: Create `transactions.gateway.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';
import { transactionSchema } from '../../shared/domain/transaction';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

const proposedFields = z.object({
  amount: z.number().positive().optional(),
  category: categorySchema.optional(),
  description: z.string().optional(),
  merchant: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const proposeMutationInput = z.object({
  intent: z.enum(['delete', 'update']),
  selector: z.object({
    transactionId: z.string().optional(),
    merchant: z.string().optional(),
    period: periodSchema.optional(),
    description: z.string().optional(),
  }),
  proposedFields: proposedFields.optional(),
});
export const proposeMutationResult = z.object({
  intent: z.enum(['delete', 'update']),
  matches: z.array(transactionSchema),
  proposedFields: proposedFields.optional(),
});

export const addTransactionInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().positive(),
  category: categorySchema.optional(),
  description: z.string(),
  merchant: z.string(),
});
export const addTransactionResult = z.object({ transaction: transactionSchema });

export const updateTransactionInput = z.object({
  transactionId: z.string(),
  fields: proposedFields,
});
export const updateTransactionResult = z.object({ transaction: transactionSchema });

export const deleteTransactionInput = z.object({ transactionId: z.string() });
export const deleteTransactionResult = z.object({ deletedId: z.string() });

export type ProposeMutationInput = z.infer<typeof proposeMutationInput>;
export type ProposeMutationResult = z.infer<typeof proposeMutationResult>;
export type AddTransactionInput = z.infer<typeof addTransactionInput>;
export type AddTransactionResult = z.infer<typeof addTransactionResult>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
export type UpdateTransactionResult = z.infer<typeof updateTransactionResult>;
export type DeleteTransactionInput = z.infer<typeof deleteTransactionInput>;
export type DeleteTransactionResult = z.infer<typeof deleteTransactionResult>;

export interface TransactionsGateway {
  proposeMutation(input: ProposeMutationInput, ctx: GatewayCtx): Promise<ProposeMutationResult>;
  add(input: AddTransactionInput, ctx: GatewayCtx): Promise<AddTransactionResult>;
  update(input: UpdateTransactionInput, ctx: GatewayCtx): Promise<UpdateTransactionResult>;
  remove(input: DeleteTransactionInput, ctx: GatewayCtx): Promise<DeleteTransactionResult>;
}
```

- [ ] **Step 2: Create `http-transactions.gateway.ts`**

```ts
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { TransactionsGateway } from '../domain/transactions.gateway';

export function makeHttpTransactionsGateway(api: ApiClient): TransactionsGateway {
  return makeHttpGateway<TransactionsGateway>(api, {
    proposeMutation: '/transactions/propose-mutation',
    add: '/transactions/add',
    update: '/transactions/update',
    remove: '/transactions/delete',
  });
}
```

- [ ] **Step 3: Create `transactions.tools.ts`**

`proposeTransactionMutation`'s transform emits an `optionPills` attachment when exactly one transaction matches (the confirm option id encodes intent + transaction id); otherwise it emits a `transactionList` so the agent can ask the user to disambiguate.

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/transactions.gateway';
import type { TransactionsGateway } from '../domain/transactions.gateway';

export function makeTransactionsTools(gateway: TransactionsGateway) {
  return {
    proposeTransactionMutation: createGatewayTool({
      id: 'proposeTransactionMutation',
      description:
        'Read-only. Resolve the target transaction(s) for a pending delete or update so a confirmation can be raised. Always call this before deleteTransaction or updateTransaction.',
      inputSchema: s.proposeMutationInput,
      outputSchema: s.proposeMutationResult,
      call: (i, c) => gateway.proposeMutation(i, c),
      transform: (output) => {
        if (output.matches.length === 1) {
          const tx = output.matches[0];
          const confirmLabel = output.intent === 'delete' ? 'Sí, borralo' : 'Sí, guardá los cambios';
          return {
            kind: 'optionPills',
            options: [
              { id: `confirm:${output.intent}:${tx.id}`, label: confirmLabel, intent: 'confirm' },
              { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
            ],
          };
        }
        return { kind: 'transactionList', items: output.matches };
      },
    }),
    addTransaction: createGatewayTool({
      id: 'addTransaction',
      description: 'Create a new transaction. Non-destructive — no confirmation needed.',
      inputSchema: s.addTransactionInput,
      outputSchema: s.addTransactionResult,
      call: (i, c) => gateway.add(i, c),
    }),
    updateTransaction: createGatewayTool({
      id: 'updateTransaction',
      description:
        'Edit an existing transaction. Confirmation-gated: only call after proposeTransactionMutation and an explicit user confirmation.',
      inputSchema: s.updateTransactionInput,
      outputSchema: s.updateTransactionResult,
      call: (i, c) => gateway.update(i, c),
    }),
    deleteTransaction: createGatewayTool({
      id: 'deleteTransaction',
      description:
        'Delete a transaction. Confirmation-gated: only call after proposeTransactionMutation and an explicit user confirmation.',
      inputSchema: s.deleteTransactionInput,
      outputSchema: s.deleteTransactionResult,
      call: (i, c) => gateway.remove(i, c),
    }),
  };
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/transactions
git commit -m "feat(ai): transactions gateway and CRUD tools"
```

---

## Task 9: Goals feature (gateway + 5 tools)

**Files:**
- Create: `apps/ai/src/goals/domain/goals.gateway.ts`
- Create: `apps/ai/src/goals/providers/http-goals.gateway.ts`
- Create: `apps/ai/src/goals/interface/goals.tools.ts`

- [ ] **Step 1: Create `goals.gateway.ts`**

```ts
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { goalSchema } from '../../shared/domain/goal';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const setGoalInput = z.object({
  name: z.string(),
  targetAmount: z.number().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkedCategory: categorySchema.optional(),
});
export const setGoalResult = z.object({ goal: goalSchema });

export const listGoalsInput = z.object({});
export const listGoalsResult = z.object({ goals: z.array(goalSchema) });

export const goalProgressInput = z.object({ goalId: z.string().optional() });
export const goalProgressResult = z.object({
  items: z.array(
    z.object({
      goalId: z.string(),
      name: z.string(),
      targetAmount: z.number(),
      targetDate: z.string(),
      savedSoFar: z.number().nullable(),
      remaining: z.number().nullable(),
      requiredMonthlyPace: z.number().nullable(),
      projectedCompletionDate: z.string().nullable(),
      onTrack: z.boolean().nullable(),
    }),
  ),
});

export const clearGoalInput = z.object({ goalId: z.string() });
export const clearGoalResult = z.object({ goalId: z.string(), cleared: z.boolean() });

export const assessGoalRiskInput = z.object({});
export const assessGoalRiskResult = z.object({
  assessments: z.array(
    z.object({
      goalId: z.string(),
      name: z.string(),
      requiredMonthlyPace: z.number().nullable(),
      recentDiscretionarySpend: z.number(),
      discretionaryByCategory: z.array(z.object({ category: categorySchema, total: z.number() })),
      headroom: z.number().nullable(),
      risk: z.enum(['none', 'watch', 'high']),
      estimatedDelay: z.string().nullable(),
    }),
  ),
});

export type SetGoalInput = z.infer<typeof setGoalInput>;
export type SetGoalResult = z.infer<typeof setGoalResult>;
export type ListGoalsInput = z.infer<typeof listGoalsInput>;
export type ListGoalsResult = z.infer<typeof listGoalsResult>;
export type GoalProgressInput = z.infer<typeof goalProgressInput>;
export type GoalProgressResult = z.infer<typeof goalProgressResult>;
export type ClearGoalInput = z.infer<typeof clearGoalInput>;
export type ClearGoalResult = z.infer<typeof clearGoalResult>;
export type AssessGoalRiskInput = z.infer<typeof assessGoalRiskInput>;
export type AssessGoalRiskResult = z.infer<typeof assessGoalRiskResult>;

export interface GoalsGateway {
  setGoal(input: SetGoalInput, ctx: GatewayCtx): Promise<SetGoalResult>;
  listGoals(input: ListGoalsInput, ctx: GatewayCtx): Promise<ListGoalsResult>;
  progress(input: GoalProgressInput, ctx: GatewayCtx): Promise<GoalProgressResult>;
  clearGoal(input: ClearGoalInput, ctx: GatewayCtx): Promise<ClearGoalResult>;
  assessRisk(input: AssessGoalRiskInput, ctx: GatewayCtx): Promise<AssessGoalRiskResult>;
}
```

- [ ] **Step 2: Create `http-goals.gateway.ts`**

```ts
import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { GoalsGateway } from '../domain/goals.gateway';

export function makeHttpGoalsGateway(api: ApiClient): GoalsGateway {
  return makeHttpGateway<GoalsGateway>(api, {
    setGoal: '/goals/set',
    listGoals: '/goals/list',
    progress: '/goals/progress',
    clearGoal: '/goals/clear',
    assessRisk: '/goals/assess-risk',
  });
}
```

- [ ] **Step 3: Create `goals.tools.ts`**

```ts
import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/goals.gateway';
import type { GoalsGateway } from '../domain/goals.gateway';

export function makeGoalsTools(gateway: GoalsGateway) {
  return {
    setGoal: createGatewayTool({
      id: 'setGoal',
      description: 'Create or update a named savings goal with a target amount and date.',
      inputSchema: s.setGoalInput,
      outputSchema: s.setGoalResult,
      call: (i, c) => gateway.setGoal(i, c),
    }),
    listGoals: createGatewayTool({
      id: 'listGoals',
      description: 'List all active savings goals.',
      inputSchema: s.listGoalsInput,
      outputSchema: s.listGoalsResult,
      call: (i, c) => gateway.listGoals(i, c),
    }),
    getGoalProgress: createGatewayTool({
      id: 'getGoalProgress',
      description:
        'Progress toward a savings goal: saved so far, remaining, required monthly pace, and whether on track. Omit goalId for all goals.',
      inputSchema: s.goalProgressInput,
      outputSchema: s.goalProgressResult,
      call: (i, c) => gateway.progress(i, c),
    }),
    clearGoal: createGatewayTool({
      id: 'clearGoal',
      description: 'Remove a savings goal.',
      inputSchema: s.clearGoalInput,
      outputSchema: s.clearGoalResult,
      call: (i, c) => gateway.clearGoal(i, c),
    }),
    assessGoalRisk: createGatewayTool({
      id: 'assessGoalRisk',
      description:
        'Assess whether recent discretionary spending threatens the pace of any active savings goal.',
      inputSchema: s.assessGoalRiskInput,
      outputSchema: s.assessGoalRiskResult,
      call: (i, c) => gateway.assessRisk(i, c),
    }),
  };
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/goals
git commit -m "feat(ai): goals gateway and savings-goal tools"
```

---

## Task 10: Agent instructions

**Files:**
- Create: `apps/ai/src/agent/instructions.ts`

- [ ] **Step 1: Create `instructions.ts`**

```ts
import type { RequestContext } from '@mastra/core/request-context';

/**
 * Builds the Gasti system prompt. `today` is interpolated fresh each turn so
 * relative dates ("este mes", "hoy") resolve against the real current date.
 */
export function buildInstructions(requestContext: RequestContext): string {
  const today = (requestContext.get('today') as string | undefined) ?? new Date().toISOString().slice(0, 10);

  return `You are Gasti, a conversational personal-finance assistant for an Argentine user.
Today's date is ${today}. Use it to resolve "este mes", "últimos 30 días", "hoy" — never hardcode a date.

VOICE
- Neutral, informative, concise. Not coachy, not gamified, not preachy.
- Never speak in the first person about yourself ("I'm Gasti", "Let me check"). No exclamation marks. No greeting that names yourself.
- Light Argentine register in Spanish (vos, tenés) is allowed, not forced.

LANGUAGE
- Detect the user's language each turn and reply in that same language. Never mix languages in one reply.

CURRENCY
- Always format amounts in Argentine locale: $1.234,56 (dot for thousands, comma for decimals), regardless of reply language.
- Negative amounts use the minus sign −$1.234,56 (U+2212, not a hyphen). Deltas are signed: +12,5%.

GROUNDING
- Never invent a number. Every total, breakdown, comparison, or lookup must come from a tool call.
- If a tool returns no data, an unknown merchant, or an error, say so plainly. Do not fabricate. Silence beats a made-up number.

MUTATIONS
- To delete or edit a transaction, never call deleteTransaction or updateTransaction directly.
- First call proposeTransactionMutation (read-only) to identify the target. Present the match and ask the user to confirm.
- Only after the user confirms (their next message) call deleteTransaction or updateTransaction.
- addTransaction is not destructive — call it directly.

PROACTIVE INSIGHTS
- When relevant — a spending question late in the month, a category near or over budget — you may volunteer ONE insight from projectMonthEnd, detectRecurringCharges, or detectCategorySpikes. Keep it short. Never lecture.
- When the user has an active savings goal and assessGoalRisk reports "watch" or "high", you may occasionally — not every turn, never nagging — note that the recent discretionary-spending pattern may delay the goal. Stay neutral; never moralize about specific purchases.
- Check the recent messages and do not repeat the same proactive insight within a short window.

MEMORY
- After a successful setBudget, clearBudget, setGoal, clearGoal, or declareIncome, and whenever the user states a preference (display name, preferred language), update working memory to reflect it.
- Recalled facts inform your answers but never replace a tool call when a fresh number is needed.`;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0. If `@mastra/core/request-context` is not the correct import path for the `RequestContext` type, confirm it via the Mastra MCP (`reference/core` or `searchMastraDocs "RequestContext"`) and adjust the import only.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/agent/instructions.ts
git commit -m "feat(ai): Gasti agent system instructions"
```

---

## Task 11: The Gasti agent

**Files:**
- Create: `apps/ai/src/agent/gasti-agent.ts`

- [ ] **Step 1: Create `gasti-agent.ts`**

`GastiTools` is the union of every feature's tool map. `memory` is typed loosely (`unknown` cast at the boundary) because the concrete `Memory` instance arrives from a separate worktree; the agent works with or without it.

```ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { buildInstructions } from './instructions';

export interface GastiAgentDeps {
  tools: Record<string, unknown>;
  memory?: unknown;
}

export function makeGastiAgent({ tools, memory }: GastiAgentDeps): Agent {
  return new Agent({
    id: 'gasti',
    name: 'Gasti',
    model: openai('gpt-4o'),
    instructions: async ({ requestContext }) => buildInstructions(requestContext),
    requestContextSchema: z.object({ today: z.string(), userId: z.string() }),
    tools: tools as never,
    ...(memory ? { memory: memory as never } : {}),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0. If `Agent`'s constructor rejects `instructions` as an async function or `requestContextSchema` is unknown, confirm the current `Agent` constructor options via the Mastra MCP (`reference/agents/agent`) and adjust types only — do not change behavior.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/agent/gasti-agent.ts
git commit -m "feat(ai): Gasti agent definition"
```

---

## Task 12: Composition root & Mastra registry

**Files:**
- Modify: `apps/ai/src/mastra/index.ts`
- Delete: `apps/ai/src/mastra/agents/index.ts`
- Modify: `apps/ai/.env.example`

- [ ] **Step 1: Delete the placeholder agent**

```bash
git rm apps/ai/src/mastra/agents/index.ts
```

- [ ] **Step 2: Rewrite `apps/ai/src/mastra/index.ts`** as the composition root

This constructs the seven HTTP gateways, builds all 24 tools, assembles the agent, and registers it with server middleware that injects `today` and `userId` into `requestContext`.

> If the libSQL storage spec has already merged, it added a `storage:` line to the `Mastra` constructor — keep that line. This task does not add storage.
> When the memory worktree merges, replace `memory: undefined` with the real `Memory` instance.

```ts
import { Mastra } from '@mastra/core';
import { makeApiClient } from '../shared/providers/api-client';
import { makeHttpSpendingGateway } from '../spending/providers/http-spending.gateway';
import { makeHttpInsightsGateway } from '../insights/providers/http-insights.gateway';
import { makeHttpBudgetsGateway } from '../budgets/providers/http-budgets.gateway';
import { makeHttpIncomeGateway } from '../income/providers/http-income.gateway';
import { makeHttpCategorizationGateway } from '../categorization/providers/http-categorization.gateway';
import { makeHttpTransactionsGateway } from '../transactions/providers/http-transactions.gateway';
import { makeHttpGoalsGateway } from '../goals/providers/http-goals.gateway';
import { makeSpendingTools } from '../spending/interface/spending.tools';
import { makeInsightsTools } from '../insights/interface/insights.tools';
import { makeBudgetsTools } from '../budgets/interface/budgets.tools';
import { makeIncomeTools } from '../income/interface/income.tools';
import { makeCategorizationTools } from '../categorization/interface/categorization.tools';
import { makeTransactionsTools } from '../transactions/interface/transactions.tools';
import { makeGoalsTools } from '../goals/interface/goals.tools';
import { makeGastiAgent } from '../agent/gasti-agent';

const api = makeApiClient();

const tools = {
  ...makeSpendingTools(makeHttpSpendingGateway(api)),
  ...makeInsightsTools(makeHttpInsightsGateway(api)),
  ...makeBudgetsTools(makeHttpBudgetsGateway(api)),
  ...makeIncomeTools(makeHttpIncomeGateway(api)),
  ...makeCategorizationTools(makeHttpCategorizationGateway(api)),
  ...makeTransactionsTools(makeHttpTransactionsGateway(api)),
  ...makeGoalsTools(makeHttpGoalsGateway(api)),
};

// Memory is built in a separate worktree; the agent runs with or without it.
const gasti = makeGastiAgent({ tools, memory: undefined });

export const mastra = new Mastra({
  agents: { gasti },
  server: {
    middleware: [
      async (context, next) => {
        const requestContext = context.get('requestContext');
        requestContext.set('today', new Date().toISOString().slice(0, 10));
        requestContext.set('userId', 'default-user');
        await next();
      },
    ],
  },
});
```

- [ ] **Step 3: Update `apps/ai/.env.example`**

Replace the file contents with:

```
# LLM provider key for the Gasti agent
OPENAI_API_KEY=

# Base URL of the apps/api service the agent's tools call.
# Empty or absent -> defaults to http://localhost:3001
API_BASE_URL=
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p apps/ai/tsconfig.json`
Expected: exit 0. If the server `middleware` signature differs, confirm via the Mastra MCP (`docs/server/middleware`, `docs/server/request-context`) and adjust the middleware only.

- [ ] **Step 5: Verify the dev server boots**

Run: `bun dev --filter=ai`
Expected: `mastra dev` starts without errors and prints the Studio URL. Stop it with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add apps/ai/src/mastra/index.ts apps/ai/.env.example
git commit -m "feat(ai): wire Gasti agent into the Mastra registry"
```

---

## Task 13: Verification pass

**Files:** none (manual verification per the spec §10).

- [ ] **Step 1: Tier-1 — build and boot**

Run: `bun run build --filter=ai`
Expected: builds without TypeScript errors.

Run: `bun dev --filter=ai`
Expected: `mastra dev` boots; open Mastra Studio; the `gasti` agent appears with all 24 tools listed: `sumSpendByCategory`, `getSpendingBreakdown`, `getTopMerchants`, `listTransactions`, `compareSpending`, `projectMonthEnd`, `detectRecurringCharges`, `detectCategorySpikes`, `setBudget`, `clearBudget`, `getBudgetProgress`, `declareIncome`, `getCashFlow`, `overrideMerchantCategory`, `overrideTransactionCategory`, `proposeTransactionMutation`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `setGoal`, `listGoals`, `getGoalProgress`, `clearGoal`, `assessGoalRisk`.

- [ ] **Step 2: Tier-1 — error handling without `apps/api`**

With `apps/api` not running, in Studio ask the agent: "¿cuánto gasté en comida este mes?"
Expected: the agent calls `sumSpendByCategory`, the tool returns a structured error, and the agent replies in Spanish that it could not reach the data — with no fabricated number. Repeat in English; expect an English reply.

- [ ] **Step 3: Tier-2 — end-to-end (requires `apps/api` from the sibling spec)**

Start `apps/api`, then walk the spec §10 Tier-2 table in Studio (scenarios 1–15): spending Q&A, breakdown/top-merchants/compare, `listTransactions` → `transactionList` payload, projection with caveat, recurring/spikes, set + check budget, budget persistence across a new thread, income + cash flow, merchant override, add transaction, the delete confirmation flow (confirm and cancel paths), set + check a savings goal, the proactive goal-risk warning, and an unanswerable question.

Each scenario passes when: the expected tool call is visible in the trace, the answer is grounded in the tool result, currency is es-AR formatted, and the reply language mirrors the prompt.

- [ ] **Step 4: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "fix(ai): verification pass adjustments"
```

If no fixes were needed, skip this step.

---

## Self-Review

**1. Spec coverage** — all 24 tools (Tasks 3–9), the 7 gateways + HTTP contract (Tasks 3–9, §6), the agent + dynamic instructions + `requestContextSchema` (Tasks 10–11, §3–4), the composition root + server middleware for `today`/`userId` (Task 12, §3), the `transform`-based attachments for `listTransactions`/`getBudgetProgress`/`proposeTransactionMutation` (Tasks 3, 5, 8, §7), the two-turn confirmation flow (instructions rule + `proposeTransactionMutation`, §7), error handling (`createGatewayTool` + retry in `api-client`, §9), and verification (Task 13, §10) all map to tasks. The Memory seam (§8) is intentionally a one-line injection point in Task 12, since Memory is built elsewhere.

**2. Placeholders** — none. Every step contains complete code or an exact command. Mastra-API uncertainties (`transform` shape, `RequestContext` import, `Agent` options, server `middleware` signature) are written with the verified-best-known form plus a precise "confirm via Mastra MCP and adjust types only" instruction — not a TODO.

**3. Type consistency** — gateway method names (`sumByCategory`, `breakdown`, `topMerchants`, `listTransactions`, `compare`, `projectMonthEnd`, `recurringCharges`, `categorySpikes`, `setBudget`, `clearBudget`, `progress`, `declareIncome`, `cashFlow`, `overrideMerchant`, `overrideTransaction`, `proposeMutation`, `add`, `update`, `remove`, `setGoal`, `listGoals`, `progress`, `clearGoal`, `assessRisk`) match between each `domain` interface, its `http-*` implementation, and its `*.tools.ts` consumer. Tool ids match the agent `tools` map keys. `GatewayCtx`, `ApiClient`, `ApiError`, `createGatewayTool` signatures are consistent across all consumers.
