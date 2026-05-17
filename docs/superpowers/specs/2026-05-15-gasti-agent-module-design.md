# Design — Gasti Agent Module

**Date:** 2026-05-15
**Scope:** `apps/ai` — the conversational Gasti agent, its 24 tools, the HTTP gateways behind them, and the exact `apps/api` HTTP contract those gateways depend on.
**Status:** Design approved, ready for implementation plan.
**Companion docs:** [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md), [CLAUDE.md](../../../CLAUDE.md)

---

## 1. Goal & non-goals

### Goal

Build the conversational **Gasti agent** in `apps/ai`: a single Mastra `Agent` that, through 24 thin tools over a defined `apps/api` HTTP contract, delivers PRODUCT.md's value moments — ad-hoc spending Q&A, proactive insights, budget coaching — plus savings-goal coaching (a PRODUCT.md amendment, §2) and the cross-cutting capabilities: income, categorization overrides, transaction CRUD. Bilingual, grounded in tool calls, with every tool call visible.

### Success criteria — the spec is done when:

1. The Gasti agent is registered in the Mastra registry and reachable over Mastra's built-in server.
2. Every PRODUCT.md user story 1–35 is reachable through agent + tool behavior, plus savings-goal coaching and the proactive goal-risk warning.
3. All 24 tools are wired by DI factories to their gateways; no tool imports a concrete gateway.
4. Bilingual reply, es-AR currency formatting, dynamic `today`, grounding (no fabricated numbers), and confirmation-gated deletes/edits all hold.
5. The UI's `HttpChatRepository` can replace `MockChatRepository` with no component changes — `ReplyEvent`s derive from Mastra's native stream.
6. `bun dev --filter=ai` boots; `bun run build --filter=ai` is clean.

### Non-goals (each has its own home)

- **`apps/api` domain implementation** — a sibling spec; only the HTTP contract is pinned here (§6).
- **The `Memory` primitive** — built in a parallel worktree; only the injection seam and working-memory contract are defined here (§8).
- **The chat UI** — already spec'd (`2026-05-14-gasti-chat-ui-design.md`).
- **Proactive Mercado Pago** — separate approved spec.
- **libSQL storage wiring** — separate approved spec; this spec **depends on it**.
- **Workflows** — none are needed; explicitly out of scope. The agent loop is the only orchestration.
- **Tests** (per PRODUCT.md), auth, multi-user.

### Depends on

The libSQL storage spec (storage adapter), the memory worktree (`Memory` instance), and the `apps/api` domain sibling spec (the 24 endpoints the gateways call — required for end-to-end verification).

---

## 2. PRODUCT.md amendment — savings goals

This feature requires one explicit amendment to `PRODUCT.md`, recorded here so the trade-off is visible (the proactive-MP spec set this precedent).

**Savings goals are in scope as a 4th value moment.** PRODUCT.md defines three value moments and lists nothing about savings targets; a "budget" there is a monthly per-category spend cap, not a cross-time savings target. This spec adds **goal coaching**: the user can set a named savings goal with a target amount and date (e.g. *"ahorrar para un auto, $8.000.000, para diciembre"*), ask how they are tracking, and — proactively — be warned when heavy discretionary spending threatens the goal's pace.

The proactive behavior is part of the amendment: when the user has an active savings goal and recent discretionary spending is high enough to threaten the required savings pace, Gasti occasionally warns that the pattern may delay the goal. The warning stays within PRODUCT.md's voice — neutral, informative, not coachy, not moralizing about specific purchases.

---

## 3. Architecture & layering in `apps/ai`

`apps/ai` is a thin **adapter layer**. It holds no business logic of its own — that lives in `apps/api`. The Clean Architecture layers map as follows:

| Layer | In `apps/ai` | Rule |
|---|---|---|
| `domain/` | Gateway *interfaces* + shared value types (`Category`, `Period`, `Transaction`, `Goal`) | Pure TS. No `@mastra/*`, no `fetch`. |
| `providers/` | HTTP gateway *implementations* — typed clients to `apps/api` | Where `fetch` lives. |
| `interface/` | The Mastra tools (`createTool`) | Thin: parse input → call gateway → return. |
| `infrastructure/` | `mastra/index.ts` registry, the agent definition, storage/memory wiring | Composition root. |

**No `use-cases/` folder in `apps/ai`, by design.** CLAUDE.md says "tools wrap use-cases"; here the use-cases live across the HTTP boundary in `apps/api`. The tool's injected dependency is a **gateway provider** implementing a domain gateway interface. The boundary is still honored — `apps/ai` is genuinely an adapter, and a gateway provider is a legitimate Clean Architecture provider.

**Dependency injection via tool factories.** Each tool file exports a factory, e.g. `makeSumSpendByCategoryTool(gateway: SpendingGateway)`. The composition root (`mastra/index.ts`) constructs the gateways once and wires every tool. No tool ever `import`s a concrete gateway — exactly the CLAUDE.md rule for Mastra.

**Feature-first folders** — seven feature folders, each owning one gateway interface, one HTTP implementation, and its cluster of tools. See §11 for the full tree.

---

## 4. The Gasti agent

### Definition

`agent/gasti-agent.ts` exports a factory `makeGastiAgent({ tools, memory })`:

- `Agent` from `@mastra/core/agent`; `id: 'gasti'`, `name: 'Gasti'`.
- `model`: `@ai-sdk/openai` → `openai('gpt-4o')`. The scaffold's existing `@ai-sdk/openai` dependency stays; `gpt-4o` is capable enough for 24-tool selection and bilingual reasoning.
- `tools`: all 24 tools, wired by the composition root. Map keys are camelCase (they become the `toolName` in Mastra's stream — see §7).
- `memory`: **injected** — the factory receives the `Memory` instance built in the parallel memory worktree. This spec attaches it and defines the contract (§8); it does not implement it. If the memory module is not yet merged, `memory` is `undefined` and the agent still boots (no recall, but functional) — graceful degradation.
- `instructions`: **dynamic** — an `async ({ requestContext }) => string` so the current date is fresh every turn.
- `requestContextSchema`: a Zod schema requiring `today` and `userId` — Mastra validates it before any LLM call.

```ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { buildInstructions } from './instructions';

export function makeGastiAgent({ tools, memory }: GastiAgentDeps) {
  return new Agent({
    id: 'gasti',
    name: 'Gasti',
    model: openai('gpt-4o'),
    instructions: async ({ requestContext }) => buildInstructions(requestContext),
    tools,
    memory,
  });
}
```

### `requestContext`

Populated by `apps/ai` server middleware (a Mastra `server.middleware` primitive), not by the caller:

- `today` — server `now`, ISO `yyyy-MM-dd`. Server-side `today` keeps "este mes / últimos 30 días / hoy" honest per PRODUCT.md ("today is dynamic").
- `userId` — `'default-user'` in v1 (single user).

Threads map to conversations (`threadId`); `resourceId = userId`.

### Instructions (`agent/instructions.ts`)

`buildInstructions(requestContext)` returns the system prompt, interpolating `today`. Nine rules:

1. **Voice** — neutral, informative, concise. No first-person product voice ("I'm Gasti", "Let me check"), no exclamation marks, no self-naming greetings. Light Argentine register in Spanish (`vos`, `tenés`) allowed, not forced.
2. **Bilingual** — detect the user's language each turn, reply in that same language, never mix languages in one response.
3. **Currency** — always es-AR (`$1.234,56`), negatives `−$1.234,56` (proper minus U+2212), deltas signed (`+12,5%`) — regardless of reply language.
4. **Today** — `{today}` is interpolated in; resolve "este mes / últimos 30 días / hoy" against it, never hardcode a date.
5. **Grounding** — never invent a number. Every total, breakdown, comparison, or lookup comes from a tool call. On empty results, unknown merchant, ambiguity, or thin data: say so plainly, do not fabricate.
6. **Mutations** — for delete/edit, never call the destructive tool directly; first call `proposeTransactionMutation` (read-only) to identify the target and raise a confirmation, then act only on the user's pill choice.
7. **Proactive insights** — when relevant (a spending question late in the month, a category near or over budget), volunteer *one* projection / recurring-charge / spike insight. Concise, never preachy.
8. **Proactive goal-risk** — when the user has an active savings goal and `assessGoalRisk` reports `watch` or `high`, occasionally — not every turn, never nagging — note that the recent discretionary-spending pattern may delay the goal. Neutral and non-judgmental; never moralize about specific purchases.
9. **Working-memory sync** — after a successful `setBudget` / `clearBudget` / `setGoal` / `clearGoal` / `declareIncome`, and when the user states a preference (display name, language), keep the working-memory mirror fresh via Mastra's built-in `updateWorkingMemory` tool.

Rules 7 and 8 are rate-limited by instruction: the agent checks `lastMessages` and will not repeat the same proactive warning within a short window.

---

## 5. The tool catalog (24 tools)

All `inputSchema` / `outputSchema` are **Zod** (a Mastra primitive). Each tool file exports a factory `make<Name>Tool(gateway)`. The agent's `tools` map key is the camelCase name — that becomes the `toolName` in Mastra's stream, which the UI keys off for the tool-call trace and attachment mapping.

### Shared `Period` input

A Zod discriminated union, resolved against `today` by `apps/api`:

```ts
type Period =
  | { kind: 'currentMonth' }
  | { kind: 'lastNDays'; n: number }
  | { kind: 'month'; month: string }                  // 'yyyy-MM'
  | { kind: 'customRange'; from: string; to: string }; // ISO 'yyyy-MM-dd'
```

### `spending/` — value moment 1, ad-hoc Q&A

| Tool | Purpose | Input → Output (sketch) |
|---|---|---|
| `sumSpendByCategory` | Total in one category over a period | `{category, period}` → `{total, transactionCount}` |
| `getSpendingBreakdown` | Ranked per-category breakdown | `{period}` → `{total, breakdown:[{category,total,share}]}` |
| `getTopMerchants` | Ranked merchants by total | `{period, limit?}` → `{merchants:[{merchant,total,count}]}` |
| `listTransactions` | Filtered lookup | `{merchant?, category?, period, limit?}` → `{transactions[], total}` |
| `compareSpending` | Two periods, per-category deltas | `{periodA, periodB}` → `{categories:[{category,totalA,totalB,delta,deltaPct}], totalA, totalB}` |

### `insights/` — value moment 2, proactive insights

| Tool | Purpose | Input → Output (sketch) |
|---|---|---|
| `projectMonthEnd` | End-of-month projection from partial data | `{category?}` → `{daysElapsed, daysInMonth, spentSoFar, projectedTotal, caveat: string\|null}` |
| `detectRecurringCharges` | Subscription-like recurring charges | `{lookbackMonths?}` → `{recurring:[{merchant,category,typicalAmount,cadence,occurrences,lastSeen}]}` |
| `detectCategorySpikes` | Month-over-month category jumps | `{}` → `{spikes:[{category,currentTotal,priorTotal,delta,deltaPct}]}` |

### `budgets/` — value moment 3, budget coaching

| Tool | Purpose | Input → Output (sketch) |
|---|---|---|
| `setBudget` | Set/update a monthly category budget | `{category, amount}` → `{category, amount, month}` |
| `clearBudget` | Remove a budget | `{category}` → `{category, cleared}` |
| `getBudgetProgress` | Spend vs budget + on-track-at-pace | `{category?}` → `{items:[{category,budget,spent,remaining,pace:'under'\|'on'\|'over',projected}]}` |

### `income/` — cross-cutting

| Tool | Purpose | Input → Output (sketch) |
|---|---|---|
| `declareIncome` | Record recurring or one-off income | `{kind:'recurring'\|'oneOff', amount, date?, description?}` → `{kind, amount, …}` |
| `getCashFlow` | Net cash flow + approximate savings rate | `{period}` → `{income, expenses, net, savingsRate: number\|null}` |

### `categorization/` — cross-cutting

| Tool | Purpose | Input → Output (sketch) |
|---|---|---|
| `overrideMerchantCategory` | Per-merchant category rule | `{merchant, category}` → `{merchant, category}` |
| `overrideTransactionCategory` | Per-transaction exception | `{transactionId, category}` → `{transactionId, category}` |

### `transactions/` — cross-cutting CRUD

| Tool | Purpose | Input → Output (sketch) |
|---|---|---|
| `proposeTransactionMutation` | **Read-only.** Resolves the target(s) of a pending edit/delete so the agent can raise a confirmation | `{intent:'delete'\|'update', selector, proposedFields?}` → `{intent, matches:[Transaction], proposedFields?}` |
| `addTransaction` | Create a transaction (non-destructive — no confirmation) | `{date?, amount, category?, description, merchant}` → `{transaction}` |
| `updateTransaction` | Edit a transaction — **confirmation-gated** | `{transactionId, fields}` → `{transaction}` |
| `deleteTransaction` | Delete a transaction — **confirmation-gated** | `{transactionId}` → `{deletedId}` |

### `goals/` — value moment 4, savings-goal coaching (per §2 amendment)

| Tool | Purpose | Input → Output (sketch) |
|---|---|---|
| `setGoal` | Create/update a named savings goal | `{name, targetAmount, targetDate, linkedCategory?}` → `{goal}` |
| `listGoals` | All active goals | `{}` → `{goals:[Goal]}` |
| `getGoalProgress` | Saved-so-far, remaining, required monthly pace, on-track vs deadline | `{goalId?}` → `{items:[{goalId,name,targetAmount,targetDate,savedSoFar,remaining,requiredMonthlyPace,projectedCompletionDate,onTrack}]}` |
| `clearGoal` | Remove a goal | `{goalId}` → `{goalId, cleared}` |
| `assessGoalRisk` | Compares recent discretionary spend against each active goal's required savings headroom | `{}` → `{assessments:[{goalId,name,requiredMonthlyPace,recentDiscretionarySpend,discretionaryByCategory[],headroom,risk:'none'\|'watch'\|'high',estimatedDelay?}]}` |

### Design notes

- **Confirmation discipline.** The agent reaches `updateTransaction` / `deleteTransaction` only *after* a `proposeTransactionMutation` call and a user pill confirmation (mechanics in §7). `addTransaction` is non-destructive, so it runs directly.
- **"Saved so far"** (`getGoalProgress`) is accumulated net cash flow (income − expenses) since the goal was set. It requires declared income — without it, `savedSoFar` is `null` with a caveat, exactly like `getCashFlow`'s `savingsRate`.
- **"Non-essential / impulsive" is a proxy, not real detection.** `apps/api` classifies the fixed PRODUCT.md categories as essential vs discretionary (a domain rule — `entretenimiento` and discretionary-leaning `otros` count as discretionary). `assessGoalRisk` flags `risk` when discretionary spend over a recent window eats into the pace headroom. The spec is explicit that this approximates spending pattern, not psychological impulsivity; the agent's warning language stays soft.

---

## 6. Gateways & the `apps/api` HTTP contract

### Gateway pattern

One gateway per feature folder. The interface lives in `domain/`, the HTTP implementation in `providers/`:

```ts
// spending/domain/spending.gateway.ts        (pure TS, no fetch)
export interface SpendingGateway {
  sumByCategory(input: SumByCategoryInput): Promise<SumByCategoryResult>;
  breakdown(input: BreakdownInput): Promise<BreakdownResult>;
  topMerchants(input: TopMerchantsInput): Promise<TopMerchantsResult>;
  listTransactions(input: ListTransactionsInput): Promise<ListTransactionsResult>;
  compare(input: CompareInput): Promise<CompareResult>;
}
// spending/providers/http-spending.gateway.ts (implements it via the shared apiClient)
```

The tool factory closes over the *interface* (`makeSumSpendByCategoryTool(gateway: SpendingGateway)`); the composition root injects the HTTP implementation. Swapping in a fake gateway is a one-line change. The tool input/output Zod schemas derive from the same shared types the gateway uses.

### Shared `apiClient`

`shared/providers/api-client.ts` — one thin typed wrapper: `post<TOut>(path, body, { userId }): Promise<TOut>`. Base URL from `API_BASE_URL` env (default `http://localhost:3001`). Every call carries an `x-user-id` header (from `requestContext.userId`; always `default-user` in v1, multi-tenant-ready). Non-2xx → throws a typed `ApiError` carrying the response envelope.

### Contract style — RPC over HTTP, one endpoint per tool

REST purity is not a project goal; a clean 1:1 tool↔endpoint mapping is — it keeps gateways trivial and the tool-call trace reproducible. All endpoints are `POST`, JSON body = tool input, JSON response = tool output (shapes in §5).

| Feature | Endpoints (`POST`) |
|---|---|
| spending | `/spending/sum-by-category` · `/breakdown` · `/top-merchants` · `/list-transactions` · `/compare` |
| insights | `/insights/project-month-end` · `/recurring-charges` · `/category-spikes` |
| budgets | `/budgets/set` · `/clear` · `/progress` |
| income | `/income/declare` · `/cash-flow` |
| categorization | `/categorization/merchant` · `/categorization/transaction` |
| transactions | `/transactions/propose-mutation` · `/add` · `/update` · `/delete` |
| goals | `/goals/set` · `/list` · `/progress` · `/clear` · `/assess-risk` |

24 endpoints, 1:1 with the 24 tools.

### Error envelope

Non-2xx responses return `{ error: { code: string, message: string } }`. `code` is a stable machine string (`NOT_FOUND`, `AMBIGUOUS_MATCH`, `NO_INCOME_DECLARED`, `VALIDATION_ERROR`, …); the gateway throws `ApiError` carrying it. How tools translate that for the agent is §9.

**This is the contract the sibling `apps/api` spec must satisfy.** It is pinned here so that spec can be written independently. This spec implements only the `apps/ai` side — the gateways against this contract.

---

## 7. Streaming, attachments & the confirmation flow

All Mastra-native — no custom route, no custom event protocol, no custom runner.

### Serving the agent

The agent is served by **Mastra's built-in server**. Registering `gasti` in the `Mastra` instance exposes its streaming HTTP endpoint automatically (`mastra dev` → :4111, `mastra build` → the production server). CORS for the UI origin is set via Mastra's `server` config. The UI's `HttpChatRepository` consumes it with **`@mastra/client-js`** (`client.getAgentById('gasti').stream(...)`).

### `ReplyEvent` mapping

The UI's `ReplyEvent` kinds (`thinking`, `toolCall`, `partial`, `final` — from the chat-UI spec) derive from Mastra's *native* stream chunks; no translation layer exists in `apps/ai`:

| UI `ReplyEvent` | Mastra stream source |
|---|---|
| `thinking` | stream opened / tool executing, no text yet |
| `toolCall` | native tool-call chunk (`toolName` + inputs) — also PRODUCT.md's tool-call transparency, for free |
| `partial` | `textStream` token deltas |
| `final` | stream finish — assembled text + toolCalls + attachments |

### Attachments via the `transform` primitive

Three tools back a UI `MessageAttachment`. Each carries a Mastra **`transform`** that shapes its result into the attachment display payload — so the display contract lives in `apps/ai` (on the tool) and the UI just renders:

| Tool | `transform` emits |
|---|---|
| `listTransactions` | `{ kind: 'transactionList', items: [...] }` |
| `getBudgetProgress` | `{ kind: 'budgetProgress', progress: {...} }` |
| `proposeTransactionMutation` | `{ kind: 'optionPills', options: [...] }` |

The implementation plan will verify the exact `transform` target and signature against the Mastra MCP before coding.

### Confirmation flow — the agent loop across two turns

**Turn 1** — user: *"borrá la última de Rappi"*. Per instruction rule 6, the agent calls the read-only `proposeTransactionMutation { intent:'delete', selector:{merchant:'Rappi', period} }`. The result `{ intent:'delete', matches:[tx] }` has a `transform` that emits the `optionPills` attachment (`Sí, borralo` / `Cancelar`; the confirm option id encodes `delete:<txId>`). The agent narrates *"¿Querés borrar Café Martínez — $3.000 del 7 may?"* and **ends the turn without calling `deleteTransaction`**.

**Turn 2** — the user's pill choice arrives as the next message on the same thread (the UI's `confirmOption` is just `reply` with a confirmation message). The agent, with `lastMessages` memory holding the pending mutation, calls `deleteTransaction { transactionId }` on confirm — or simply acknowledges on cancel. The destructive tool executes only here.

No `agent-approval` suspension is used (conversational pills were the chosen mechanism); the gate is instruction rule 6 plus the two-turn loop.

### Scope note

This spec *pins* the streaming/attachment contract. Writing the `HttpChatRepository` file is a thin `apps/ui` wiring task (the chat-UI spec reserved it). Agent-module verification (§10) uses `@mastra/client-js` / Mastra Studio directly, so it does not depend on the UI.

---

## 8. The Memory seam

`Memory` itself is built in a parallel worktree. This section defines the **contract between the two worktrees**.

### What the agent module (this spec) provides

- The agent factory takes `memory` and attaches it: `new Agent({ …, memory })`.
- **Graceful degradation** — `memory` `undefined` → the agent boots and works, just without recall. The agent module never hard-depends on memory existing.
- Instruction rule 9 (§4): keep the working-memory mirror fresh via Mastra's built-in `updateWorkingMemory` tool after mutations and preference statements. Recalled facts inform answers but never substitute for a tool call when a number is needed (grounding rule 5 still wins).

### What the memory worktree owns

- Constructing the `Memory` instance — `lastMessages` window, `semanticRecall` (topK, messageRange, vector store), `workingMemory` mode (schema vs template), storage adapter wiring (libSQL, per the storage spec).
- The working-memory schema/template itself.

### Thread / resource model

Resource-scoped working memory; `resourceId = userId` (`default-user` in v1), `threadId = conversation`. Resource scope means budgets, goals, and preferences persist across every conversation — set once, remembered.

### Working-memory mirror contract

The "both" decision: the `apps/api` DB is the source of truth; working memory holds an in-context mirror that makes proactivity cheap. The agent module asks the memory worktree to schema the following:

| Mirror | Why it is in working memory |
|---|---|
| `userProfile` — display name, language hint | Addressed correctly; per-user, always relevant |
| `budgets` — active `{category, amount}` this month | Proactive overrun warnings without a tool call every turn |
| `goals` — active `{id, name, targetAmount, targetDate}` | Proactive goal-risk warnings (rule 8) need to know a goal exists |
| `income` — declared recurring monthly figure | Framing spend against income |

**Deliberate refinement of PRODUCT.md:** categorization overrides are **not** mirrored into working memory. PRODUCT.md's "working-memory contents" list included them, but overrides can grow unbounded and the agent never needs them in context — they are resolved server-side at aggregation time by `apps/api`. Mirroring only small, always-relevant state keeps working memory a clean scratchpad.

---

## 9. Error handling & edge cases

### Two error classes

**Transport failures** — `apps/api` unreachable, 5xx, timeout. The `apiClient` retries **once** (short backoff) on network error / 5xx; if it still fails, the gateway throws `ApiError` and the tool returns a structured `{ error: true, code, message }`. The agent, per the grounding rule, tells the user plainly it could not reach their data **in their language**, and never fabricates a number.

**Domain outcomes** — expected results, not failures; `apps/api` returns them in the error envelope and the agent narrates them honestly:

| Code | Agent behavior |
|---|---|
| `NOT_FOUND` (unknown merchant, no rows) | "No encontré movimientos de X." — honest empty answer |
| `AMBIGUOUS_MATCH` (`proposeTransactionMutation` hit several) | Surface the matches as a `transactionList`, ask which — **no confirm pills until exactly one target** |
| `NO_INCOME_DECLARED` (`getCashFlow`, goal progress) | Answer what it can, note income is not declared, offer to record it |
| `VALIDATION_ERROR` | Ask the user for the missing or clearer input |

### Edge cases

| Case | Behavior |
|---|---|
| Empty aggregation (total 0) | Not an error — "No gastaste nada en X este mes." (PRODUCT.md story 31) |
| Ambiguous question (category, missing year) | Agent asks a clarifying question rather than guessing |
| `proposeTransactionMutation` → 0 matches | Agent says it could not find it; no pills |
| User never confirms a pending delete | Mutation lapses silently; no tool call. The confirm option id encodes `delete:<txId>` so a later confirm still targets the right row |
| Language switches mid-conversation | Agent follows the latest turn's language |
| Stale seed → near-empty "este mes" | Agent reports thin data honestly; `projectMonthEnd` returns its small-sample `caveat`. Reshaping the seed is an `apps/api` / candidate decision, out of scope here |
| `requestContext` missing `today` / `userId` | The agent's `requestContextSchema` (Mastra primitive) throws before the LLM call — defensive; should never happen since middleware sets them |
| Proactive insight repetition | Agent checks `lastMessages` and will not repeat the same projection / spike / goal-risk warning within a short window |

**Tool input validation** is Mastra-native: each tool's Zod `inputSchema` is enforced by Mastra; a malformed model call is rejected and the model corrects — no bad data reaches a gateway.

---

## 10. Verification (manual)

No tests are a deliverable (PRODUCT.md), so verification is a manual walkthrough. Tools: **Mastra Studio** (`mastra dev`) and **`@mastra/client-js`**. The agent module is verifiable without the UI.

### Tier 1 — agent-module-only (no `apps/api` needed)

1. `bun dev --filter=ai` boots `mastra dev`; the Gasti agent appears in Studio. `bun run build --filter=ai` is clean.
2. All 24 tools are registered on the agent (visible in Studio's tool list).
3. With `apps/api` down, ask "¿cuánto gasté en comida?" → the agent reports plainly that it cannot reach the data, in Spanish; ask in English → English. **Verifies** DI wiring, transport-error handling, grounding (no fabricated number), bilingual reply.

### Tier 2 — end-to-end (`apps/api` from the sibling spec running)

One scenario per capability:

| # | Prompt | Verifies |
|---|---|---|
| 1 | "¿cuánto gasté en comida este mes?" | `sumSpendByCategory` call visible in trace, grounded answer, `$1.234,56` format |
| 2 | "how much did I spend on food this month?" | English answer, same tool |
| 3 | "¿en qué gasté más?" / "top 5 merchants" / "compará abril vs mayo" | `getSpendingBreakdown` / `getTopMerchants` / `compareSpending` |
| 4 | "mostrame las transacciones de Rappi" | `listTransactions` → `transactionList` attachment payload |
| 5 | "proyectá cómo termina el mes" | `projectMonthEnd` + small-sample caveat |
| 6 | "¿tengo suscripciones?" / a spike scenario | `detectRecurringCharges` / `detectCategorySpikes` |
| 7 | "ponele 50000 a comida" → "¿cómo voy con comida?" | `setBudget` → `getBudgetProgress` (pace) → `budgetProgress` attachment |
| 8 | New thread → "¿cuál era mi budget de comida?" | budget persists (resource-scoped memory) |
| 9 | "gano 1.500.000 por mes" → cash-flow question | `declareIncome` → `getCashFlow` with savings rate |
| 10 | "Coderhouse es educación" → re-ask a breakdown | `overrideMerchantCategory`, aggregation honors it |
| 11 | "agregá un café de 3000 en Starbucks hoy" | `addTransaction` — runs directly, no confirmation |
| 12 | "borrá la última de Rappi" → pick `Sí, borralo` | `proposeTransactionMutation` → `optionPills` → turn 2 → `deleteTransaction`. Re-run, pick `Cancelar` → no deletion |
| 13 | "quiero ahorrar para un auto, 8 millones, para diciembre" → "¿cómo voy con el auto?" | `setGoal` → `getGoalProgress` |
| 14 | Active goal + heavy `entretenimiento` spend → ask any spending question | agent occasionally volunteers the `assessGoalRisk` warning, neutrally |
| 15 | Ask something unanswerable from the data | agent says it cannot; no fabrication |

### Streaming contract

Via `@mastra/client-js`, confirm the stream yields native tool-call chunks, text deltas, and the `transform`ed display payloads for the three attachment tools.

---

## 11. Locations summary (Clean Architecture)

```
apps/ai/src/
├── mastra/
│   └── index.ts                       ← registry: agent, storage (infrastructure / composition root)
├── agent/
│   ├── gasti-agent.ts                 ← makeGastiAgent({ tools, memory })
│   └── instructions.ts                ← buildInstructions(requestContext) — the 9 rules
├── shared/
│   ├── domain/
│   │   ├── category.ts                ← Category union
│   │   ├── period.ts                  ← Period discriminated union
│   │   ├── transaction.ts             ← Transaction value type
│   │   └── api-error.ts               ← ApiError + error-envelope type
│   └── providers/
│       └── api-client.ts              ← typed POST wrapper to apps/api
├── spending/
│   ├── domain/spending.gateway.ts
│   ├── providers/http-spending.gateway.ts
│   └── interface/
│       ├── sum-spend-by-category.tool.ts
│       ├── get-spending-breakdown.tool.ts
│       ├── get-top-merchants.tool.ts
│       ├── list-transactions.tool.ts
│       └── compare-spending.tool.ts
├── insights/
│   ├── domain/insights.gateway.ts
│   ├── providers/http-insights.gateway.ts
│   └── interface/
│       ├── project-month-end.tool.ts
│       ├── detect-recurring-charges.tool.ts
│       └── detect-category-spikes.tool.ts
├── budgets/
│   ├── domain/budgets.gateway.ts
│   ├── providers/http-budgets.gateway.ts
│   └── interface/
│       ├── set-budget.tool.ts
│       ├── clear-budget.tool.ts
│       └── get-budget-progress.tool.ts
├── income/
│   ├── domain/income.gateway.ts
│   ├── providers/http-income.gateway.ts
│   └── interface/
│       ├── declare-income.tool.ts
│       └── get-cash-flow.tool.ts
├── categorization/
│   ├── domain/categorization.gateway.ts
│   ├── providers/http-categorization.gateway.ts
│   └── interface/
│       ├── override-merchant-category.tool.ts
│       └── override-transaction-category.tool.ts
├── transactions/
│   ├── domain/transactions.gateway.ts
│   ├── providers/http-transactions.gateway.ts
│   └── interface/
│       ├── propose-transaction-mutation.tool.ts
│       ├── add-transaction.tool.ts
│       ├── update-transaction.tool.ts
│       └── delete-transaction.tool.ts
└── goals/
    ├── domain/goals.gateway.ts
    ├── providers/http-goals.gateway.ts
    └── interface/
        ├── set-goal.tool.ts
        ├── list-goals.tool.ts
        ├── get-goal-progress.tool.ts
        ├── clear-goal.tool.ts
        └── assess-goal-risk.tool.ts
```

`mastra/index.ts` is the composition root: it constructs the seven HTTP gateways, builds the 24 tools via their factories, calls `makeGastiAgent({ tools, memory })`, and registers the agent (plus storage and server config) on the `Mastra` instance.

---

## 12. References

- [PRODUCT.md](../../../PRODUCT.md) — product domain, user stories, constraints (amended in §2).
- [DESIGN.md](../../../DESIGN.md) — visual system (consumed by the chat-UI spec, not by this one).
- [CLAUDE.md](../../../CLAUDE.md) — Clean Architecture rules, Superpowers workflow, Mastra rules.
- `2026-05-14-gasti-chat-ui-design.md` — the UI; defines `ChatRepository`, `ReplyEvent`, `MessageAttachment`.
- `2026-05-14-mastra-libsql-storage-design.md` — the storage adapter this spec depends on.
- `2026-05-14-proactive-mercadopago-design.md` — sets the `apps/api`-owns-domain precedent and the PRODUCT.md-amendment precedent.
- Mastra MCP — `@mastra/mcp-docs-server` for current Mastra primitive docs (`Agent`, `createTool`, `RequestContext`, `Memory`, `transform`, server). Consult before implementing any Mastra API.
