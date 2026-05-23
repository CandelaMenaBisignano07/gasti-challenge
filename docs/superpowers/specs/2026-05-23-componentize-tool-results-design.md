# Componentize tool results into rich attachments

**Date:** 2026-05-23
**Status:** Approved — pending plan

## Problem

Today only three Mastra tools produce visual cards in the chat (`listTransactions`, `getBudgetProgress`, `proposeTransactionMutation`). The remaining tools that return structured data — lists and aggregates — are narrated entirely as text by the agent, which both bloats responses and loses the trust/transparency win the existing cards give. The system prompt also references a `proposeCategoryChange` card that the code never emits.

The goal is to componentize every tool whose output is structurally meaningful (a list of items, a ranked breakdown, a comparison, a single computed total or projection), so the agent's reply collapses to a one-sentence headline and the data lives in a card the user can scan.

## Scope

Componentize the following nine tools:

| Tool | Output | New attachment kind |
|---|---|---|
| `sumSpendByCategory` | `{ category, total, transactionCount }` | `stat` |
| `projectMonthEnd` | projection + caveat | `stat` |
| `getSpendingBreakdown` | `{ total, breakdown: [{ category, total, share }] }` | `rankedList` |
| `getTopMerchants` | `{ merchants: [{ merchant, total, transactionCount }] }` | `rankedList` |
| `compareSpending` | per-category deltas across two periods | `compareList` |
| `detectCategorySpikes` | per-category prior/current jumps | `compareList` |
| `detectRecurringCharges` | recurring subscriptions list | `bulletList` |
| `listCategories` | categories with descriptions | `bulletList` |
| `proposeCategoryChange` (bugfix) | `{ intent, affectedCount, ... }` | existing `optionPills` |

Out of scope: any tool that already has a `transform`; mutation tools that return acknowledgements (`setBudget`, `addTransaction`, etc.); any visual refresh of the three existing cards.

## Design decisions

### Abstraction: generic primitive cards

Four new generic UI primitives, mapped to by the tools above. No bespoke component per tool.

### Empty / error rule

If a tool returns an empty list or the gateway error envelope, the `transform` returns `null` and **no card is rendered**. The agent narrates the absence. A card present in the UI continues to mean "real data, grounded in the tool call."

To support this, `apps/ai/src/shared/interface/create-gateway-tool.ts` is adjusted: when `config.transform` returns `null` or `undefined`, the `transform.display.output` block is suppressed for that call.

### Agent instructions

The `PRESENTATION` section of `apps/ai/src/agent/instructions.ts` is rewritten to list every card-rendering tool grouped by kind, plus the standing rule: reply with one short headline sentence, never re-state items the card shows. The rule applies uniformly to every card kind.

### Categorisation label capitalisation

A tiny helper `apps/ui/src/shared/format/capitalize.ts` replaces the inline `name.charAt(0).toUpperCase() + name.slice(1)` currently in `budget-progress-card.tsx`. The transforms in `apps/ai` replicate the helper inline (one-line function) — the two apps don't share a workspace package and a single-line helper isn't worth one.

### `compareSpending` period labels

The current `compareResult` schema does not carry human-readable period labels (`"abr 2026"`, `"may 2026"`). The schema is extended with `labelA: string` and `labelB: string`, computed by the use-case from the input periods. The transform reads them directly — no derivation in the interface layer.

## Components

All four live in `apps/ui/src/shared/ui/`. They reuse `<Card>`, `<Num>`, `<BarMeter>`, `category-icon`, and the existing tone tokens (`text-tone-over`, `text-tone-caution`).

### `StatCard`

```ts
type StatAttachment = {
  kind: 'stat';
  label: string;
  value: number;
  caption?: string;
  tone?: 'neutral' | 'caution' | 'over';
};
```

Layout: label (eyebrow), large `<Num>` value, optional caption below in muted text. Tone tints the value colour.

### `RankedListCard`

```ts
type RankedListAttachment = {
  kind: 'rankedList';
  title?: string;
  items: Array<{
    label: string;
    value: number;
    share?: number;       // 0..1
    sub?: string;
    icon?: CategoryIconName;
  }>;
};
```

Each row: optional icon · label / sub · value · optional bar (only when `share` is set). Items render in array order — the transform is responsible for sorting.

### `CompareListCard`

```ts
type CompareListAttachment = {
  kind: 'compareList';
  title?: string;
  periodA: string;        // "abr 2026"
  periodB: string;        // "may 2026"
  rows: Array<{
    label: string;
    a: number;
    b: number;
    delta: number;
    deltaPct: number;     // signed
  }>;
};
```

Header lists both periods. Each row: label · `<Num a>` · `<Num b>` · signed delta (`+12,5%` / `−4,1%` with U+2212). Delta colour: red for `> 0`, green for `< 0`, neutral at zero.

### `BulletListCard`

```ts
type BulletListAttachment = {
  kind: 'bulletList';
  title?: string;
  items: Array<{
    label: string;
    sub?: string;
    value?: number;
    icon?: CategoryIconName;
  }>;
};
```

Un-ranked itemised list. No bar, no ordinal. Used for recurring subscriptions (sub: "mensual · prom. $4.500") and category listing (sub: description text).

## Wiring

### UI

- `apps/ui/src/chat/domain/message.ts`: extend `MessageAttachment` union with the four new kinds.
- `apps/ui/src/chat/components/message-attachments.tsx`: add four `if (a.kind === ...)` branches mapping to the new components.
- `apps/ui/src/shared/format/capitalize.ts`: new one-line helper.
- `apps/ui/src/budgets/components/budget-progress-card.tsx`: replace the inline capitalisation with the helper.

### AI

- `apps/ai/src/shared/interface/create-gateway-tool.ts`: allow `transform` to return `null | undefined` and suppress the display block in that case.
- `apps/ai/src/spending/interface/spending.tools.ts`: add `transform` to `sumSpendByCategory`, `getSpendingBreakdown`, `getTopMerchants`, `compareSpending`.
- `apps/ai/src/insights/interface/insights.tools.ts`: add `transform` to `projectMonthEnd`, `detectRecurringCharges`, `detectCategorySpikes`.
- `apps/ai/src/categorization/interface/categorization.tools.ts`: add `transform` to `listCategories` and `proposeCategoryChange`.
- `apps/ai/src/spending/domain/spending.gateway.ts`: extend `compareResult` with `labelA: string`, `labelB: string`.
- `apps/api/...`: extend the compare use-case / controller / response shape to populate `labelA` / `labelB` (period → human label conversion lives in a use-case helper, not in the controller).
- `apps/ai/src/agent/instructions.ts`: rewrite `PRESENTATION` section.

### Agent instructions (replacement text)

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
- When you call one of these tools, reply with a single short headline sentence — the top number or the framing, never the items. No "abajo", "a continuación", "como se ve".
- For tools without a card (mutations, overrides, etc.), narrate the result normally.
```

## Boundaries

- **Domain (`apps/ai/src/.../domain/`)** stays framework-agnostic. The `transform` lives in the `interface` layer where it already does — domain schemas are not touched except `compareResult` (a value-object additive change).
- **Use-cases** still own all business logic (category mapping, period labelling, share computation). Transforms are pure shape mappers from domain output to attachment payload — no branching beyond the empty-result check.
- **UI components** are presentational and unaware of tool names, kinds, or domain entities. They consume the typed attachment payload only.

## Verification plan

1. `bun run typecheck` (root) passes after the union extension.
2. `bun run build --filter=api`, `bun run build --filter=ai`, `bun run build --filter=ui` all pass.
3. Manual QA in `bun dev`:
   - "¿cuánto gasté en comida este mes?" → `stat` card with the total.
   - "desglosá mis gastos de mayo" → `rankedList` with share bars.
   - "top 5 merchants del mes" → `rankedList`.
   - "compará abril vs mayo" → `compareList` with both period labels.
   - "¿qué saltó este mes?" → `compareList` from spikes (or empty → no card).
   - "¿qué suscripciones tengo?" → `bulletList` from recurring (or empty → no card).
   - "qué categorías hay?" → `bulletList` from listCategories.
   - "proyectame fin de mes" → `stat` with caveat caption.
   - "borrá la categoría X" → `optionPills` confirmation card via proposeCategoryChange.
4. Empty-data sanity check: pick a future month → tools that return empty produce no card and the agent narrates the absence honestly.

## Out of scope

- Visual refresh of `transactionList`, `budgetProgress`, or `optionPills`.
- Adding tests beyond what changes in the comparison use-case (label computation, if non-trivial).
- New tools or new gateway endpoints (only `compareResult` is extended, additively).
- Tone tokens — reuse existing.
- Mobile layout — desktop-first per PRODUCT.md.
