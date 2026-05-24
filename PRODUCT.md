# Product — Gasti

Gasti is a conversational personal-finance assistant for an Argentine spender who already has transaction data and just wants to *ask* about it. The user has the records but not the visibility: how much went to `comida` this month vs. last, whether streaming subs are quietly bleeding them, where the month will land if today's pace continues, how they're doing against a budget they vaguely set in their head. A spreadsheet answers all of that, reluctantly. Gasti answers it in one sentence, in the language the user typed, in a neutral tone.

This document defines **product domain and constraints**. It does not pin down a specific tool list, a specific storage adapter, or specific prompts — those are decided in the implementation plan.

---

## Problem Statement

*"Tengo mis transacciones pero no tengo idea cómo voy. Quiero preguntar y que me responda — no abrir Excel."*

The user has a stream of personal-finance transactions (Argentine pesos, mixed categories — comida, transporte, servicios, entretenimiento, salud, educación, otros). The data is structured and available, but extracting answers from it takes friction the user won't pay: opening a sheet, writing a formula, remembering which column is what, repeating the exercise next week. Existing personal-finance apps in this market are either too heavy (full PFM platforms with onboarding, KYC, bank linking) or too dumb (logs you scroll). The user wants a fast, conversational layer over their own data — read it, write to it, reason about it, and remember the parts that matter.

## Solution

*"Le pregunto cualquier cosa sobre mis gastos, me dice. Le pongo un presupuesto, me avisa cómo voy. Me deja agregar o corregir movimientos sin abrir un formulario. Y me marca cosas raras (suscripciones que ya ni uso, proyección de fin de mes) sin que yo tenga que pedirlo."*

Gasti is a 100% conversational assistant that wraps the user's transaction set with three value moments:

1. **Ad-hoc Q&A over the spending** — answer any question that can be derived from the data: totals, breakdowns, comparisons, top merchants, filtered lookups. The conversational floor.
2. **Proactive insights** — surface patterns the user didn't ask about: end-of-month projection at minimum, with additional insight surfaces decided in the implementation plan.
3. **Budget & goals coaching** — let the user set monthly budgets per category and longer-horizon savings goals through conversation, remember them across sessions, report progress on request, warn proactively when a category is on track to overrun, and assess whether a recent spending pattern puts a goal at risk.

Cross-cutting capabilities support all three: the user can correct categorizations (per-merchant or per-transaction), declare income (recurring or one-off), create / update / delete transactions through conversation, and create / rename / delete / describe their own categories beyond the seven defaults. Every interaction is bilingual — Gasti replies in whichever language the user wrote in.

When a connected source (e.g. Mercado Pago) reports a new payment or a status change on a past payment, Gasti surfaces it in the open chat as an editable card. The user resolves it from the conversation; Gasti never delivers via push notification, email, or any out-of-session channel.

## User Stories

1. As an Argentine spender, I want to ask Gasti "¿cuánto gasté en comida este mes?" in plain Spanish, so that I get a one-sentence answer without opening a spreadsheet.
2. As a user, I want to ask the same question in English ("how much did I spend on food this month?") and get the answer in English, so that I'm not forced into one language.
3. As a user, I want Gasti to default its currency formatting to ARS locale (`$1.234,56`) regardless of the response language, so that amounts always look right.
4. As a user, I want to see which tool calls Gasti made for any answer (tool name and inputs, rendered in the UI), so that I can trust the answer is grounded and not hallucinated.
5. As a user, I want to ask "¿en qué gasté más este mes?" and get a ranked breakdown by category, so that I can see where my money goes at a glance.
6. As a user, I want to ask "top 5 merchants del mes" and get an ordered list with totals, so that I can spot which places are eating my budget.
7. As a user, I want to ask "compará abril vs mayo" and get a side-by-side, per-category comparison with deltas, so that I can see month-over-month drift.
8. As a user, I want to ask "mostrame todas las transacciones de Rappi en los últimos 30 días", so that I can audit a specific merchant.
9. As a user, I want to ask about arbitrary date ranges ("desde el 15 de abril al 5 de mayo"), so that I'm not locked into calendar months.
10. As a user, I want Gasti to project where the current month will end based on partial data and today's date, so that I know whether to slow down.
11. As a user, I want the projection to include an honest caveat when the sample is small or noisy, so that I don't over-trust the number.
12. As a user, I want Gasti to surface additional proactive insights (the specific set decided in the implementation plan) when they're relevant, so that I learn things I didn't know to ask.
13. As a user, I want to set a monthly budget for a category by saying "ponele 50000 a comida este mes", so that I don't need a form.
14. As a user, I want to update or clear an existing budget through conversation, so that I can iterate without ceremony.
15. As a user, I want to ask "¿cómo voy con comida?" and get current spend, budget remaining, and whether I'm on track at today's pace, so that I can adjust mid-month.
16. As a user, I want Gasti to warn me proactively when a category is projected to overrun, so that I don't find out at month-end.
17. As a user, I want my budgets to persist across sessions, so that I don't re-set them every time I open the chat.
18. As a user, I want to correct a merchant's category once and have it stick ("Coderhouse es educación, no otros"), so that future aggregations honor my correction.
19. As a user, I want to correct a single transaction's category without changing the merchant's default category, so that one-off exceptions don't pollute the rule.
20. As a user, I want Gasti's overrides to take precedence over the seed JSON's categories at aggregation time, so that my corrections actually show up in totals.
21. As a user, I want to declare my income through conversation ("gano 1.500.000 por mes" or "me entró un pago de 800.000 hoy"), so that Gasti can frame spending against income.
22. As a user, I want Gasti to compute net cash flow and an approximate savings rate when I've declared income, so that I see more than just expenses.
23. As a user, I want to add a transaction by saying "agregale a hoy un café de 3000 en Starbucks", so that I can keep the data current without leaving the chat.
24. As a user, I want to edit an existing transaction (amount, category, description, merchant, date) through conversation, so that I can fix mistakes quickly.
25. As a user, I want to delete a transaction through conversation, so that I can clean up duplicates or wrong entries.
26. As a user, I want Gasti to confirm before deleting and before any irreversible change, so that I don't lose data to a misread instruction.
27. As a user, I want Gasti to remember my display name and any language preference I set, so that I'm addressed correctly across sessions.
28. As a user, I want Gasti to recall things I said earlier in past conversations when relevant ("¿cuál era mi budget de comida?", "¿qué te dije del alquiler la semana pasada?"), so that I don't repeat myself.
29. As a user, I want Gasti to handle short-term conversation context (the last few messages) coherently, so that I can use pronouns and follow-ups naturally.
30. As a user, I want Gasti to use the current real date when computing "este mes", "últimos 30 días", "hoy", so that the answer matches the moment I'm asking.
31. As a user, I want Gasti to tell me when it can't answer (not enough data, unknown merchant, ambiguous question) instead of making something up, so that I can trust silence over a fabricated number.
32. As a user, I want every aggregation to be reproducible — Gasti shows the tool call and the underlying numbers — so that I can sanity-check anything.
33. As a user, I want to interact through a simple chat UI (no forms, no buttons, no setup wizard), so that the experience matches the promise of "ask anything".
34. As a developer extending Gasti, I want clear architectural boundaries (use-cases, repositories, providers, Mastra tools as a thin layer over use-cases), so that I can add a new tool without touching unrelated layers.
35. As a developer reviewing Gasti, I want every business rule to live in a use-case (not in a controller, not in a Next route, not inside a Mastra tool's `execute`), so that the code reads as a series of intents.
36. As a user, I want to set a savings goal ("quiero juntar 500.000 para Bariloche") through conversation, so that I have a target beyond just monthly budgets.
37. As a user, I want to ask "¿cómo voy con la meta de Bariloche?" and get current progress, so that I can see if I'm on track.
38. As a user, I want Gasti to flag when my recent discretionary spending pattern likely delays an active goal, so that I can correct course without being nagged.
39. As a user, I want to create a custom category beyond the seven defaults ("crypto", "rituales del finde"), so that the way I track my spending matches how I actually think about it.
40. As a user, I want to attach a short description to a custom category, so that Gasti and its classifier know what kinds of merchants belong in it.
41. As a user, I want to connect my Mercado Pago account once via OAuth, so that real movements appear in the chat without me having to type them.
42. As a user, when I first connect Mercado Pago I want the option to import the last 24h / 7d / 15d / 30d of payments (or skip), so that my chat has history to ask about right away.
43. As a user, I want each new payment Gasti detects from Mercado Pago to arrive as an editable card in the chat (right category? right description?), so that I have one place to keep the record clean.
44. As a user, when a Mercado Pago payment is later canceled or reimbursed via chargeback, I want Gasti to surface that status change as a notice in the chat, so that my history reflects what actually happened.
45. As a user, I want Gasti to never push me notifications, emails, or out-of-session alerts, so that it stays a tool I open, not a tool that interrupts me.

## Implementation Decisions

These are architectural / product-domain decisions. Concrete file paths, tool names, prompt strings, storage drivers, and specific insight algorithms are deferred to the implementation plan.

### Architecture & layering

- **Clean Architecture in all three apps** (`apps/api`, `apps/ai`, `apps/ui`). Layering: `domain` (entities, value objects, repository interfaces) → `use-cases` (one per intent, depend on interfaces) → `providers` (reusable services) → `repositories` (concrete implementations of domain contracts) → `infrastructure` (Nest modules, Next routes, Mastra registry, file IO) → `interface` (thin controllers, route handlers, agent tools). Domain code never imports framework symbols.
- **Feature-first folder layout** inside each app (e.g. `transactions/`, `budgets/`, `income/`, `categorization/`, `insights/`), each containing its own `domain/`, `use-cases/`, `repositories/`, `providers/`, and framework wiring file.
- **Dependency injection everywhere.** NestJS constructor injection; Mastra tool factories receive their dependencies (use-cases) at construction time and never `import` repositories inside `execute`; UI data access lives behind hooks/clients, never reaches into infra from components.
- **Controllers / route handlers / Mastra tools are thin.** Parse input, call a use-case, return the result. No branching business logic in the interface layer.

### Mastra (apps/ai)

- **Use Mastra primitives only.** `Agent`, `createTool` (with Zod `inputSchema` / `outputSchema`), `Workflow` where genuinely warranted, and `Memory` for state. Custom tool-calling loops, hand-rolled agent runners, or homemade abstractions over Mastra are explicitly forbidden.
- **Memory model:** `workingMemory` (per user/thread template) + `semanticRecall` (vector retrieval with topK + a small messageRange) + `lastMessages` (short-term chat history). Exact tuning (window sizes, topK, schemas) is set in the implementation plan.
- **Working-memory contents:** a **mirror** (not source of truth) of the state Gasti wants in the agent's context for cheap proactivity — monthly budgets keyed by category, active savings goals, recurring income figure, and user preferences (display name, language hint override). The authoritative copies live in the API-side repositories. Categorization overrides are not mirrored in working memory; they apply at aggregation time inside `apps/api`.
- **Storage adapter:** a Mastra-supported local adapter (likely `@mastra/libsql`) chosen in the plan. The agent layer never knows the adapter brand.
- **Tools wrap use-cases.** A tool's `execute` calls a use-case, never a repository directly. Tool layer = boundary; work happens inside use-cases.

### Data model

- **Transactions** live behind a `TransactionsRepository` interface in the `transactions` feature. The seed implementation reads from `data/transactions.json`. Schema: `id, date (ISO yyyy-MM-dd), amount (positive ARS number), currency ("ARS"), category, description, merchant, direction ("income" | "expense"), status ("active" | "canceled" | "reimbursed"), statusDetail (free-form, optional), source ("manual" | "mercadopago"), mpPaymentId (optional, unique when present), counterparty (optional, payer/recipient name), operationType (optional, MP-side classifier: "regular_payment" | "money_transfer" | "recurring_payment"), needsReview (boolean, true when a classifier landed it in "otros" with low confidence)`. Seed categories: `comida, transporte, entretenimiento, salud, servicios, educacion, otros`. The data model is **multi-tenant-ready** (every row carries `userId`) even though v1 ships with a single `default-user`.
- **Transactions are mutable through conversation.** Add / edit / delete operations are first-class use-cases and exposed as Mastra tools (specific tool list deferred to the plan). The persistence shape (rewrite JSON, sidecar mutations file, dedicated store) is an implementation-plan call.
- **Budgets, income statements, categorization overrides, savings goals, and user-owned categories** live in their own JSON repositories under `apps/api/data/` (one file per feature). The working memory in Mastra mirrors a subset of this state for the agent's context; the API repos are the source of truth.
- **User-owned categories carry a semantic description.** Beyond the 7 seed categories, the user can create / rename / delete / describe categories. The description is what tells the agent (and the MP payment classifier) what kinds of merchants belong in that category — a custom `"rituales del finde"` is only as good as the description.
- **Aggregations honor overrides.** When computing totals/breakdowns, the categorization resolution order is: transaction-level override → merchant-level override → seed/user category on the transaction.

### Conversation, language, and rendering

- **Bilingual auto-detect.** The agent detects the user's input language per turn and replies in the same language. Currency formatting follows ARS locale regardless of language (`$1.234,56`).
- **Voice:** neutral, informative, concise. Not coachy, not gamified, not preachy. Light Argentine register (`vos`, `tenés`) allowed in Spanish; not forced.
- **Tool calls are visible.** The UI renders the tool name and inputs alongside the agent's answer for every turn that invokes tools. This is both a trust feature and a stated impronta opportunity from the brief.
- **Confirmations on mutations.** Deletes and edits require an explicit confirmation step in the conversation before the use-case runs.

### Dates and time

- **Today is dynamic.** All "today", "this month", "last 30 days" reasoning uses the real current date at query time. There is no hardcoded reference date.

### Cross-app boundaries

- `apps/ui` (Next.js) holds the chat surface and renders tool-call traces. It does not contain business logic.
- `apps/api` (NestJS) and `apps/ai` (Mastra) collectively own the domain. The exact split (which use-cases live in which app, whether the UI talks to one or both, whether the AI app calls the API app via HTTP or shares code through a workspace package) is an implementation-plan decision driven by Clean-Architecture boundaries — not by framework convenience.

## Testing Decisions

`apps/api` ships with a `bun:test` suite covering use-cases, override resolution, projection / insight math, mutation gating, and the MP polling + backfill paths. Tests target the external behavior of use-cases — not Mastra tools (thin shells), not the agent itself (non-deterministic LLM output).

## Out of Scope

The following are explicit non-goals for v1. Anything not listed elsewhere as in-scope is out.

- **Multi-user UX, accounts, auth, login.** v1 ships with a single user (`default-user`) and a single thread. The data model already carries `userId` on every row so the path to multi-user is a UI / auth layer, not a schema migration.
- **Connected sources beyond Mercado Pago.** Mercado Pago is in scope (OAuth Connect + server-driven polling). Other wallets and banks are out for v1 but the contracts (`PaymentClassifier`, proactive cards, SSE channel) are shaped so a Modo / Ualá / Naranja X integration could plug in without touching the agent.
- **Aggregator-based bank scraping.** No Plaid, no Belvo, no Pluggy, no OFX, no CSV upload, no screen-scraping. The chosen integration model is OAuth-on-the-provider, not credentials-on-an-aggregator.
- **Investments, portfolios, stocks, crypto.** Different domain.
- **Multi-currency.** ARS only.
- **Tax tracking, withholdings, AFIP/ARCA, retenciones.** Out of scope.
- **Out-of-session channels.** Gasti can speak unsolicited **while the chat is open** (SSE-pushed cards when a connected source reports a new payment or status change). Push notifications, scheduled alerts, email digests, and any other channel that reaches the user when the chat is closed are explicitly out.
- **Mobile app / PWA polish.** Web only, desktop-first. Responsive behavior is welcome but not a v1 requirement.
- **Recurring-transaction automation.** Users can declare recurring *income*, but Gasti does not auto-generate recurring expense transactions.
- **Multi-account / shared-wallet semantics.** No "this card vs that card", no "shared with partner".
- **Onboarding flows, KYC, profile setup.** No first-run wizard. The user opens the chat and starts talking. (The first-connect MP backfill modal is the only modal in the product, and it defaults to "skip".)

## Further Notes

- **Dataset staleness.** The seed `data/transactions.json` ends 2026-05-24. Because today's date is dynamic, a reviewer running this repo months later will see an empty "este mes" and uninteresting projections. Mitigation is a candidate choice (shift dates to now-relative at boot, regenerate the seed, accept the staleness). Not decided here. Real MP-connected sessions side-step this entirely — the polling loop keeps the dataset fresh on its own.
- **Dynamic-date trade-off acknowledged.** Demos are less deterministic across run dates. The product choice favors honest behavior over demo-friendly fiction.
- **No specific persona, by design.** The product accommodates a salaried employee, a freelancer, or a household lead — anyone whose data fits the schema. The trade-off: less product "impronta" than a sharply-defined persona would give. Compensation is in tool depth, Mastra idiomaticness, and UX detail around tool-call transparency and override resolution.
- **Mastra MCP available.** `.mcp.json` wires `@mastra/mcp-docs-server` for live Mastra docs. Use it before guessing any Mastra API.
- **Brief's evaluation criteria** (for context — not a substitute for shipping good product): AI-native dev, Mastra depth, sensible agent tools, velocity, communication. Clean Architecture is acknowledged as a bonus, not a requirement.
- **Companion document.** `DESIGN.md` (separate) covers visual system, tokens, spacing, color, typography, and component behavior — `PRODUCT.md` deliberately does not.
