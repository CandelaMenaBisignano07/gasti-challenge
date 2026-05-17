# Design — Gasti `apps/api` Domain

**Date:** 2026-05-17
**Scope:** `apps/api` — the NestJS domain implementation behind the 24-endpoint HTTP contract the Gasti agent module depends on.
**Status:** Design approved, ready for implementation plan.
**Companion docs:** [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md), [CLAUDE.md](../../../CLAUDE.md), [2026-05-15-gasti-agent-module-design.md](2026-05-15-gasti-agent-module-design.md)

---

## 1. Goal & non-goals

### Goal

Implement the **sibling `apps/api` spec** that the agent-module design (§6) pins but does not implement. `apps/api` becomes the domain owner: a NestJS app exposing **24 `POST` endpoints**, 1:1 with the agent's 24 tools, that deliver PRODUCT.md's value moments — ad-hoc spending Q&A, proactive insights, budget coaching — plus savings-goal coaching and the cross-cutting capabilities (income, categorization overrides, transaction CRUD). All business logic lives here, behind the HTTP contract; `apps/ai` deliberately holds none.

### Success criteria — the spec is done when:

1. All 24 endpoints from the agent-module contract (§6 of that spec) respond with the exact input/output shapes defined there.
2. Every aggregation honors categorization overrides (resolution order: transaction → merchant → seed).
3. Periods resolve against the server's current date; no hardcoded reference date.
4. Budgets, income, goals, and overrides persist across restarts.
5. Transaction add/update/delete mutate `data/transactions.json` and survive a restart.
6. Errors render the `{ error: { code, message } }` envelope.
7. `bun run build --filter=api` is clean; `bun dev --filter=api` boots and serves the 24 endpoints.
8. `bun test --filter=api` passes — the 24 use-cases and the domain algorithms have behavioral test coverage.

### Non-goals (each has its own home)

- **The agent, tools, and gateways** — the agent-module spec; this spec only satisfies its HTTP contract.
- **Coupling to the proactive-Mercado-Pago spec.** That sibling spec also touches `apps/api` and commits it to a libSQL store. This spec is **self-contained** and deliberately does **not** share its `shared/db` module, libSQL adapter, or `transactions` table. The two `apps/api` surfaces are independent worktrees; integration, if ever needed, is out of scope here.
- Auth, multi-user.
- **The chat UI**, libSQL/Mastra storage, memory.

**Testing note.** PRODUCT.md §Testing Decisions states tests are not a deliverable. The user has explicitly instructed that `apps/api` ship with tests; user instructions take precedence, so testing **is in scope** for this spec — see §10. PRODUCT.md's *guidance for when tests are written* is honored: test the external behavior of use-cases, not implementation details; do not test controllers' framework wiring; no agent/LLM tests.

### Depends on

Nothing. `apps/api` is currently a bare NestJS skeleton (`app.module.ts`, `app.controller.ts` with `/health`, `main.ts`). This spec builds on that skeleton with no external prerequisites. End-to-end verification uses the agent module, but this spec stands alone.

---

## 2. Persistence decisions

Two decisions, taken during brainstorming:

1. **JSON-file persistence, self-contained.** No libSQL, no database server. Transactions stay in the repo-root `data/transactions.json`; budgets, income, goals, and categorization overrides live in small JSON files under `apps/api/data/`. Repository **interfaces** keep the storage swappable — a future libSQL implementation is a one-line DI change.
2. **Transaction mutations rewrite `data/transactions.json` in place.** `addTransaction` / `updateTransaction` / `deleteTransaction` read and write that file directly. No sidecar, no copy. (Trade-off acknowledged: a reviewer who mutates data through the chat gets a dirty git diff and no clean reset; accepted for read-path simplicity.)

Categorization overrides are a **separate concern** from transaction CRUD: they live in their own file and are applied at aggregation time by `CategoryResolver`, never baked into transaction rows. This preserves the transaction-vs-merchant precedence model that an in-place rewrite would otherwise collapse.

---

## 3. Architecture & layering

`apps/api` follows Clean Architecture per CLAUDE.md, organized **feature-first**.

| Layer | Contents | Rule |
|---|---|---|
| `domain/` | Value types (`Category`, `Period`, `Transaction`, `Budget`, `IncomeStatement`, `Goal`, `CategoryOverrides`), repository **interfaces**, pure domain rules (`CATEGORY_CLASS`), `DomainError`. | No `@nestjs/*`, no IO. |
| `use-cases/` | One class per intent — 24 use-cases. Depend on repository/provider **interfaces** via DI tokens. All business logic. | No framework branching. |
| `providers/` | Reusable services: `PeriodResolver`, `CategoryResolver`, generic `JsonStore<T>`. | Reusable, injected. |
| `repositories/` | Concrete JSON-file implementations of the domain contracts. | Implement `domain/` interfaces. |
| `interface/` | Thin controllers — one method per endpoint: parse, call use-case, return. | No business logic. |
| `*.module.ts` | NestJS module — wires DI for the feature. | Composition. |

### Cross-cutting facts

- **No `today` in the wire contract.** The request body carries only the tool input. `PeriodResolver` resolves every `Period` against the server's `new Date()` — keeps "este mes / últimos 30 días / hoy" honest (PRODUCT.md "today is dynamic"). `apps/ai` and `apps/api` share a host in dev, so their clocks agree.
- **`x-user-id` header** is read into a request value and threaded to use-cases, but v1 is single-user — storage files are global, not keyed by user. The header is the multi-tenant seam; it does not scope storage in v1.
- **Validation:** a `ZodValidationPipe` validates each endpoint body against a per-endpoint Zod schema. The 24 schemas mirror the contract shapes the agent-module plan already defines in `apps/ai`. (Zod, not class-validator, so the schema is a faithful copy of the pinned contract. `apps/api` and `apps/ai` are separate workspaces and share no code — each app owns its own copy of the schemas.)
- **Errors:** a global `DomainExceptionFilter` catches `DomainError` and renders `{ error: { code, message } }` with the mapped HTTP status.

### DI

Standard NestJS constructor injection. Repositories and providers are bound to interface tokens in each feature module's `providers` array; use-cases receive the interfaces. No `new` inside a use-case. The transactions module **exports** `TransactionsRepository` so `spending`, `insights`, `budgets`, and `goals` can read transactions without re-opening the file. `SharedModule` exports `PeriodResolver`, `CategoryResolver`, and the `JsonStore` factory.

---

## 4. Folder structure

```
apps/api/src/
├── main.ts                      MODIFY  enable CORS, global ZodValidationPipe + DomainExceptionFilter
├── app.module.ts                MODIFY  import SharedModule + the 7 feature modules
├── shared/
│   ├── domain/
│   │   ├── category.ts          Category union + CATEGORY_CLASS (essential/discretionary)
│   │   ├── period.ts            Period discriminated union
│   │   ├── transaction.ts       Transaction value type
│   │   └── domain-error.ts      DomainError + stable code constants
│   ├── providers/
│   │   ├── json-store.ts        generic JsonStore<T> — atomic file IO
│   │   ├── period-resolver.ts   Period → { from, to } vs server today
│   │   └── category-resolver.ts override resolution: tx → merchant → seed
│   ├── interface/
│   │   ├── zod-validation.pipe.ts
│   │   └── domain-exception.filter.ts
│   └── shared.module.ts
├── transactions/
│   ├── domain/transactions.repository.ts        interface
│   ├── repositories/json-transactions.repository.ts
│   ├── use-cases/                propose-mutation, add, update, delete
│   ├── interface/transactions.controller.ts
│   └── transactions.module.ts
├── spending/
│   ├── use-cases/                sum-by-category, breakdown, top-merchants, list, compare
│   ├── interface/spending.controller.ts
│   └── spending.module.ts
├── insights/
│   ├── use-cases/                project-month-end, recurring-charges, category-spikes
│   ├── interface/insights.controller.ts
│   └── insights.module.ts
├── budgets/
│   ├── domain/budgets.repository.ts
│   ├── repositories/json-budgets.repository.ts
│   ├── use-cases/                set, clear, progress
│   ├── interface/budgets.controller.ts
│   └── budgets.module.ts
├── income/
│   ├── domain/income.repository.ts
│   ├── repositories/json-income.repository.ts
│   ├── use-cases/                declare, cash-flow
│   ├── interface/income.controller.ts
│   └── income.module.ts
├── categorization/
│   ├── domain/categorization.repository.ts
│   ├── repositories/json-categorization.repository.ts
│   ├── use-cases/                override-merchant, override-transaction
│   ├── interface/categorization.controller.ts
│   └── categorization.module.ts
└── goals/
    ├── domain/goals.repository.ts
    ├── repositories/json-goals.repository.ts
    ├── use-cases/                set, list, progress, clear, assess-risk
    ├── interface/goals.controller.ts
    └── goals.module.ts

apps/api/data/                    gitignored — runtime state (budgets/income/goals/overrides)
data/transactions.json            the seed — rewritten in place
```

`spending` and `insights` have no `repositories/` of their own — they are pure read features over the injected `TransactionsRepository`.

---

## 5. Shared kernel

### `JsonStore<T>`

Generic file-backed store, constructed with `{ filePath, fallback }`:

- `read(): Promise<T>` — returns parsed contents, or `fallback` (deep-cloned) if the file is absent.
- `write(data: T): Promise<void>` — **atomic**: write to `filePath + '.tmp'`, then `rename` over `filePath`, so a crash never leaves a half-written file.

Each feature repository wraps one `JsonStore` bound to its file. This collapses four near-identical persistence files into one generic factory (CLAUDE.md "generic factories over boilerplate").

### `PeriodResolver`

Pure provider: `resolve(period: Period): { from: string; to: string }` — inclusive ISO `yyyy-MM-dd` bounds, computed against `new Date()`:

- `currentMonth` → first day of this month … today.
- `lastNDays` → today − (n−1) … today.
- `calendarMonth` (`yyyy-MM`) → first … last day of that month.
- `customRange` → `from` … `to` verbatim.

### `CategoryResolver`

Depends on `CategorizationRepository`. `effectiveCategory(tx): Category` resolves: transaction-level override → merchant-level rule → the transaction's seed `category`. Every aggregation routes category reads through this resolver, so user corrections show up in totals (PRODUCT.md stories 18–20). Also used by `AddTransaction` to default a category from a merchant rule when the input omits one.

### `DomainError` & error codes

`DomainError` carries a stable `code`. `DomainExceptionFilter` maps it:

| Code | HTTP | Raised when |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `ZodValidationPipe` rejects the body. |
| `NOT_FOUND` | 404 | `update` / `delete` / category override targets an unknown transaction id; `clear`/`progress` targets an unknown goal id. |
| (unexpected) | 500 | Any non-`DomainError` throwable (file IO failure, bug). |

**Graceful, non-error outcomes** (the agent narrates these — they are `200`, not envelopes):

- `getCashFlow` / `getGoalProgress` with no income declared → `200` with `savingsRate` / `savedSoFar` as `null`.
- `proposeTransactionMutation` → always `200` with a `matches` array of length 0..n. "Ambiguous" (n>1) and "not found" (n=0) are the **agent's** reading of that array, per the agent spec §9 — `apps/api` does not error here.
- Empty aggregation (total `0`, empty arrays) → `200`.

---

## 6. The 24 endpoints

All `POST`. Request body = tool input; JSON response = tool output. Shapes are the contract pinned in the agent-module design §5/§6 and are authoritative there; summarized here per feature.

### `transactions/` — CRUD (`TransactionsRepository`, JSON impl rewrites `data/transactions.json`)

`generateId()` continues the seed's `txn_NNN` sequence (`txn_051`, …).

| Endpoint | Use-case | Logic |
|---|---|---|
| `/transactions/propose-mutation` | `ProposeTransactionMutation` | Read-only. Resolves `selector` (`merchant?`, `category?`, `period?`, `transactionId?`) to candidate transactions. Returns `{ intent, matches: Transaction[], proposedFields? }`. Always `200`. |
| `/transactions/add` | `AddTransaction` | `{ date?, amount, category?, description, merchant }`. `date` defaults to today; `category` omitted → `CategoryResolver` (merchant rule, else `otros`). `currency` always `ARS`. Returns `{ transaction }`. |
| `/transactions/update` | `UpdateTransaction` | `{ transactionId, fields }` partial (`amount`/`category`/`description`/`merchant`/`date`). Unknown id → `NOT_FOUND`. Returns `{ transaction }`. |
| `/transactions/delete` | `DeleteTransaction` | `{ transactionId }`. Unknown id → `NOT_FOUND`. Returns `{ deletedId }`. |

### `spending/` — five read use-cases over `TransactionsRepository` + `PeriodResolver` + `CategoryResolver`

| Endpoint | Output sketch |
|---|---|
| `/spending/sum-by-category` | `{ category, total, transactionCount }` |
| `/spending/breakdown` | `{ total, breakdown: [{ category, total, share }] }` — `share` = category total ÷ period total |
| `/spending/top-merchants` | `{ merchants: [{ merchant, total, transactionCount }] }` — honors `limit` |
| `/spending/list-transactions` | `{ transactions: Transaction[], total }` — honors `merchant`/`category`/`limit` |
| `/spending/compare` | `{ totalA, totalB, categories: [{ category, totalA, totalB, delta, deltaPct }] }` |

### `insights/` — three read use-cases (algorithms in §7)

`/insights/project-month-end` · `/insights/recurring-charges` · `/insights/category-spikes`

### `budgets/` — `BudgetsRepository` over `apps/api/data/budgets.json`

| Endpoint | Logic |
|---|---|
| `/budgets/set` | Upsert `{ category, amount }` into the current `yyyy-MM`. Returns `{ category, amount, month }`. |
| `/budgets/clear` | Remove the current-month budget for a category. Returns `{ category, cleared }`. |
| `/budgets/progress` | `GetBudgetProgress` — spend vs budget + pace (§7). Returns `{ items: [...] }`. |

### `income/` — `IncomeRepository` over `apps/api/data/income.json`

| Endpoint | Logic |
|---|---|
| `/income/declare` | `recurring` → set `recurringMonthly`; `oneOff` → append `{ amount, date?, description? }` (`date` defaults to today). Returns the recorded entry. |
| `/income/cash-flow` | `GetCashFlow` — income vs expenses over a period (§7). |

### `categorization/` — `CategorizationRepository` over `apps/api/data/category-overrides.json`

| Endpoint | Logic |
|---|---|
| `/categorization/merchant` | Upsert a merchant → category rule. Returns `{ merchant, category }`. |
| `/categorization/transaction` | Upsert a transaction → category exception. Unknown id → `NOT_FOUND`. Returns `{ transactionId, category }`. |

### `goals/` — `GoalsRepository` over `apps/api/data/goals.json`

| Endpoint | Logic |
|---|---|
| `/goals/set` | Upsert by `name` (same name → update; else create with new id + `createdAt` = today). Returns `{ goal }`. |
| `/goals/list` | `{ goals: Goal[] }`. |
| `/goals/progress` | `GetGoalProgress` (§7). Unknown `goalId` → `NOT_FOUND`. |
| `/goals/clear` | Remove a goal. Unknown id → `NOT_FOUND`. Returns `{ goalId, cleared }`. |
| `/goals/assess-risk` | `AssessGoalRisk` (§7). |

---

## 7. Domain algorithms

All amounts ARS; every category read routes through `CategoryResolver`.

### `projectMonthEnd`

`daysElapsed` = today's day-of-month; `daysInMonth` = length of the current month; `spentSoFar` = current-month sum (optionally filtered to one `category`); `projectedTotal = spentSoFar / daysElapsed × daysInMonth`. `caveat` (string|null) is **non-null** when `daysElapsed < 5` **or** the window has fewer than 5 transactions — an honest small-sample warning (PRODUCT.md story 11).

### `detectRecurringCharges`

`lookbackMonths` default 3. Group transactions by merchant. A merchant is **recurring** when its charges fall in ≥2 distinct calendar months with amounts within ±15% of their average. Emit `{ merchant, category, typicalAmount (average), cadence: "monthly", occurrences (count), lastSeen (max date) }`.

### `detectCategorySpikes`

Per category, compare the current calendar month against the prior. A **spike** = `deltaPct ≥ +40%` **and** `delta ≥ 10000` ARS (the absolute floor suppresses noise on tiny categories). Returns spikes sorted by `delta` descending.

### `getBudgetProgress`

For each budgeted category (or all): `spent` = current-month sum; `remaining = budget − spent`; `projected` = the `projectMonthEnd` formula for that category. `pace`: `under` if `projected < 0.95 × budget`, `over` if `projected > 1.05 × budget`, else `on`.

### `getCashFlow`

Over the resolved period: `income` = `recurringMonthly` prorated to the period's day-span (`recurringMonthly × periodDays / 30`) **plus** one-offs dated within the period; `expenses` = transaction sum; `net = income − expenses`; `savingsRate = net / income` when `income > 0`, else `null`.

### `getGoalProgress`

Per goal (or one `goalId`): `savedSoFar` = accumulated net cash flow (income − expenses) from `goal.createdAt` to today — `null` when no income is declared. `remaining = targetAmount − savedSoFar`; `requiredMonthlyPace = remaining / monthsUntil(targetDate)`; `projectedCompletionDate` extrapolated from the current monthly net rate; `onTrack = projectedCompletionDate ≤ targetDate`.

### `assessGoalRisk`

Domain constant `CATEGORY_CLASS`:

- **essential:** `comida, transporte, salud, servicios, educacion`
- **discretionary:** `entretenimiento, otros`

For each active goal: `recentDiscretionarySpend` = discretionary-category sum over the last 30 days; `discretionaryByCategory` = per-category breakdown of that; `headroom` = monthly net excluding discretionary spend − `requiredMonthlyPace`; `risk` = `none` when discretionary spend ≤ headroom, `watch` when it exceeds headroom by ≤1.5×, `high` beyond that; `estimatedDelay` (months) optional. The spec is explicit: this approximates a **spending pattern**, not psychological impulsivity.

---

## 8. Persistence file shapes

Repo-root `data/transactions.json` — the existing seed array of `Transaction`, rewritten in place. Under `apps/api/data/` (gitignored, created lazily by `JsonStore` with the stated fallback):

```jsonc
// budgets.json — keyed by yyyy-MM ; fallback {}
{ "2026-05": { "comida": 50000, "transporte": 30000 } }

// income.json — fallback { "recurringMonthly": null, "oneOffs": [] }
{ "recurringMonthly": 1500000,
  "oneOffs": [ { "amount": 800000, "date": "2026-05-12", "description": "Freelance" } ] }

// goals.json — fallback []
[ { "id": "goal_001", "name": "Auto", "targetAmount": 8000000,
    "targetDate": "2026-12-31", "linkedCategory": null, "createdAt": "2026-05-17" } ]

// category-overrides.json — fallback { "merchants": {}, "transactions": {} }
{ "merchants": { "Coderhouse": "educacion" },
  "transactions": { "txn_012": "salud" } }
```

`.gitignore` gains `apps/api/data/`.

---

## 9. Error handling & edge cases

| Case | Behavior |
|---|---|
| Empty aggregation (total 0) | `200`, `total: 0` / empty arrays — not an error. |
| Unknown merchant in `list-transactions` | `200`, empty `transactions`. |
| `update` / `delete` / transaction-override on a bad id | `NOT_FOUND` (404). |
| `goals/progress` or `goals/clear` on a bad `goalId` | `NOT_FOUND` (404). |
| `addTransaction` with no `category`, no merchant rule | category `otros`. |
| `getCashFlow` / `getGoalProgress` with no income | `200`, null `savingsRate` / `savedSoFar`. |
| `proposeTransactionMutation` with 0 or many matches | `200`, `matches` array — agent interprets. |
| Malformed body | `ZodValidationPipe` → `VALIDATION_ERROR` (400). |
| Period reasoning | always resolved against server `new Date()`. |
| Concurrent writes | single-process NestJS; `JsonStore` writes are atomic (temp + rename). v1 assumes no concurrent mutation of the same file. |

---

## 10. Testing & verification

Per the user's instruction, `apps/api` ships with tests.

### Test runner

**`bun:test`** — Bun's built-in runner. Zero extra dependencies: the `api` workspace already runs on Bun (`bun --watch src/main.ts`). Test files sit next to their subject as `*.test.ts`. A `test` script (`bun test`) is added to `apps/api/package.json` and a `test` pipeline to `turbo.json` so `bun test --filter=api` works from the root.

### What is tested

Per PRODUCT.md's testing guidance — **external behavior, not implementation**:

- **The 24 use-cases.** Each use-case has a clear input → output contract; test that contract. Repositories are replaced with **in-memory fakes** implementing the same domain interface (the DI seam makes this a one-line swap) — no JSON files touched in tests. Assert on returned values, not on "method X was called N times".
- **The domain algorithms (§7).** The math-heavy logic — `projectMonthEnd` (including the small-sample `caveat`), `detectRecurringCharges`, `detectCategorySpikes`, budget `pace`, `getCashFlow` (including `savingsRate` null path), `getGoalProgress`, `assessGoalRisk` (the `none`/`watch`/`high` thresholds and `CATEGORY_CLASS`) — gets focused cases for normal, boundary, and empty inputs.
- **`PeriodResolver`** — each `Period` variant resolves to the right `{from,to}`; tests inject a fixed reference date so they are deterministic regardless of run date.
- **`CategoryResolver`** — the override precedence (transaction → merchant → seed).

### What is not tested

- Controllers' NestJS wiring (thin pass-through; covered indirectly via use-cases).
- `JsonStore`'s file IO is exercised through one small dedicated test (atomic write + fallback); feature repositories' JSON impls are otherwise covered by the fake-backed use-case tests.
- No HTTP/e2e tests, no agent/LLM tests.

### TDD

Implementation follows the Superpowers `test-driven-development` skill: RED → GREEN → REFACTOR per use-case and per algorithm. The implementation plan's per-task verification step is **run the task's tests** (`bun test <path>`), with `bun run build --filter=api` as the type-check gate.

### Manual verification (in addition)

- **Endpoint walkthrough:** `bun dev --filter=api`, then one representative `curl` per feature — `/spending/sum-by-category`, `/spending/breakdown`, `/insights/project-month-end`, `/budgets/set` then `/budgets/progress`, `/income/declare` then `/income/cash-flow`, `/categorization/merchant`, `/transactions/add` then `/transactions/update` then `/transactions/delete`, `/goals/set` then `/goals/progress` then `/goals/assess-risk`. Confirm response shapes match §6 and that a bad id renders the `{ error: { code, message } }` envelope.
- **Persistence:** restart the API and confirm a set budget / declared income / created goal / override survives.
- **End-to-end:** the agent-module spec's Tier-2 walkthrough (§10 there) with both apps running.

---

## 11. References

- [PRODUCT.md](../../../PRODUCT.md) — product domain, user stories, constraints.
- [CLAUDE.md](../../../CLAUDE.md) — Clean Architecture rules, feature-first organization, DI rules.
- [2026-05-15-gasti-agent-module-design.md](2026-05-15-gasti-agent-module-design.md) — the agent module; §5/§6 pin the HTTP contract this spec satisfies.
- [2026-05-15-gasti-agent-module.md](../plans/2026-05-15-gasti-agent-module.md) — the agent-module plan; its Zod schemas define the exact wire shapes mirrored here.
