# Category mutation confirmation

**Date:** 2026-05-18
**Status:** Approved — ready for planning

## Problem

Deleting or renaming a custom category is destructive — `deleteCategory`
reassigns every transaction, budget and merchant-rule in the category to
`otros`; `renameCategory` cascades the rename across all three. Today the agent
calls `deleteCategory` / `renameCategory` directly and only asks for confirmation
in plain text. There is no confirmation card.

The chat already has a confirmation-card pattern — but only for transaction
mutations. The agent calls the read-only `proposeTransactionMutation`; its result
is mapped (in `apps/ui/src/chat/providers/tool-result-attachment.ts`) to an
`optionPills` attachment, which `apps/ui/src/shared/ui/option-pill-stack.tsx`
renders as "Sí, borralo" / "Cancelar" buttons. `deleteTransaction` /
`updateTransaction` are confirmation-gated. Category mutations never got the same
treatment, so they feel inconsistent and the destructive fallout to `otros` is
not surfaced before the user commits.

## Goal

1. Deleting or renaming a custom category goes through a read-only propose step
   that renders a confirmation card with two buttons.
2. The card states how many transactions the change will move — deterministically
   rendered in the card, not left to the agent's prose.
3. `deleteCategory` / `renameCategory` become confirmation-gated: the agent calls
   them only after a propose step and an explicit user confirmation.
4. The whole flow mirrors `proposeTransactionMutation` and reuses its
   infrastructure unchanged.

## Out of scope

- **Impact counts for budgets and merchant-rules.** Only the transaction count is
  shown. Deleting a category also reassigns budgets and merchant overrides; those
  counts are deliberately omitted to keep the card simple.
- **Page-reload void of stale proposals.** A category propose left unconfirmed
  across a page load is governed by the same mechanism as transactions. The
  separate `2026-05-18-stale-mutation-confirmation` spec handles reload-voiding;
  when implemented it should generalize to cover category proposals. This spec
  does not duplicate that work — it only adds the one-turn expiry already in the
  `MUTATIONS` block.
- **Confirmation for `createCategory`.** Creating a category is non-destructive;
  it stays a direct call with no confirmation, as today.

## Approach

Add a vertical slice for categories that mirrors the transaction propose slice:
`apps/api` read-only use-case → controller route → `apps/ai` gateway method →
agent tool → `apps/ui` attachment mapping.

The propose tool is necessarily category-specific — `proposeTransactionMutation`
is hard-wired to `Transaction[]` and cannot be reused directly. But everything
downstream of the tool result is reused **unchanged**: the `optionPills`
attachment kind, `option-pill-stack.tsx`, `resolveOptionLabel`
(`apps/ui/src/chat/repositories/agent-chat-repository.ts`), the pill→text confirm
path (`apps/ui/src/chat/use-cases/confirm-mutation.ts`), and confirmation-gating.

One unified tool `proposeCategoryChange` carries `intent: 'delete' | 'rename'`,
mirroring how `proposeTransactionMutation` unifies `delete | update` under one
`intent` field.

`resolveOptionLabel` sends the tapped pill's **label** as plain text; the agent
confirms from that label plus the preceding propose card. The pill `id` only has
to be unique within the attachment. Ids follow the transaction convention
(`confirm:delete:<name>`, `confirm:rename:<name>`, `cancel`).

## Components

### 1. `apps/api` — `categorization` feature

**`use-cases/propose-category-change.use-case.ts`** — new read-only use-case
`ProposeCategoryChange`. Read-only: it does not mutate.

- Validates against the live category list: the category exists and is **custom**
  (not one of the seven defaults `comida, transporte, entretenimiento, salud,
  servicios, educacion, otros`). For `rename`, the normalized `newName` is 1–24
  characters and free of collision with any default or existing custom category.
  A rename to the same normalized name is allowed (no-op rename, consistent with
  `RenameCategory`).
- Counts affected transactions: injects `CategoryResolver` (the same dependency
  `ProposeTransactionMutation` uses), resolves every transaction's effective
  category — base category after per-transaction and per-merchant overrides — and
  counts those whose resolved category equals the target `name`.
- Returns `{ intent, name, newName?, affectedTransactionCount }`. On a validation
  failure throws `DomainError`, consistent with `CreateCategory` / `RenameCategory`
  / `DeleteCategory`.

**`interface/categorization.controller.ts`** — new route
`POST /categorization/categories/propose`, thin: parse input, call the use-case,
return the result. **`interface/categorization.schemas.ts`** — request/response
schemas. **`categorization.module.ts`** — wire `ProposeCategoryChange` into the
module `providers`.

### 2. `apps/ai` — `categorization` feature

**`domain/categorization.gateway.ts`** — add Zod schemas
`proposeCategoryChangeInput` (`{ intent, name, newName? }`) and
`proposeCategoryChangeResult` (`{ intent, name, newName?, affectedTransactionCount:
z.number() }`), and a `propose` method on the `CategorizationGateway` interface.

**`providers/http-categorization.gateway.ts`** — implement `propose` against the
new `POST /categorization/categories/propose` route.

**`interface/categorization.tools.ts`** — add a `proposeCategoryChange` tool
(read-only) via the existing `createGatewayTool` factory. Update the
`deleteCategory` and `renameCategory` tool descriptions to state they are
confirmation-gated — only call after `proposeCategoryChange` and an explicit user
confirmation.

### 3. `apps/ui`

**`src/chat/domain/message.ts`** — the `optionPills` attachment type gains an
optional generic `caption?: string`. Optional and generic so the transaction flow
omits it and the transaction card is unchanged; `optionPills` stays reusable.

**`src/shared/ui/option-pill-stack.tsx`** — when `caption` is present, render it
as a line above the buttons. When absent, render exactly as today.

**`src/chat/providers/tool-result-attachment.ts`** — add `case
'proposeCategoryChange'`. Map the result to:

```
{
  kind: 'optionPills',
  caption: <built from affectedTransactionCount + intent + names>,
  options: [
    { id: `confirm:${intent}:${name}`, label: <confirm label>, intent: 'confirm' },
    { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
  ],
}
```

- Confirm label by intent: `delete` → "Sí, borrala", `rename` → "Sí, renombrala".
- Caption copy by intent, with singular/plural handling
  (`1 transacción` / `N transacciones`):
  - `delete` → "N transacciones pasarán a "otros"."
  - `rename` → "N transacciones pasarán a "<newName>"."
  - `affectedTransactionCount === 0` → "Ninguna transacción será afectada."
- Building user-facing copy here is consistent with the existing
  `proposeTransactionMutation` case, which already builds the confirm-label
  strings in this file.

### 4. `apps/ai/src/agent/instructions.ts`

- The "rich cards" line (currently line 62) gains `proposeCategoryChange` — it
  shows a confirmation card.
- The categories block (currently line 51): "to rename or delete a custom
  category, **first call `proposeCategoryChange`** (read-only) to present the
  change for confirmation" — instead of calling `renameCategory` / `deleteCategory`
  directly.
- Category delete and rename join the existing `MUTATIONS` confirmation rules:
  confirmation is an explicit affirmative reply approving *that* proposal; a
  proposal is valid only for the single user turn that immediately follows it; if
  the user moves on, the proposal is dropped silently and the new message handled
  on its own; a mutation never happens as a side effect of an unrelated turn.
- The agent still refuses to propose a delete/rename of a default category in
  text — `proposeCategoryChange` validation is a second safety net, not the
  primary guard.

## Data flow

```
"borrá animales"
  agent -> proposeCategoryChange { intent:'delete', name:'animales' }   (read-only)
    API ProposeCategoryChange: validate (exists + custom), count via resolver
      -> { intent:'delete', name:'animales', affectedTransactionCount:12 }
        tool result -> toAttachment -> optionPills
          { caption:'12 transacciones pasarán a "otros".',
            options:[ Sí, borrala | Cancelar ] }
          option-pill-stack renders caption + buttons

"Sí, borrala" tapped
  resolveOptionLabel -> sends label "Sí, borrala" as text
    agent (MUTATIONS rules) -> deleteCategory { name:'animales' }

rename: identical with intent:'rename' + newName, caption references newName,
        ends in renameCategory.
```

## Error handling

- Propose validation fails — default category, unknown name, rename collision,
  bad `newName` length: `ProposeCategoryChange` throws `DomainError`. The gateway
  wraps it in the existing error envelope (`{ error: true }`); `toAttachment`
  returns `null`, so no pills render and the agent reports the problem in text —
  same as today's category refusals.
- Cancel, or any non-confirming next turn: the proposal expires per the
  `MUTATIONS` one-turn rule; neither `deleteCategory` nor `renameCategory` is
  called.
- Empty custom category (`affectedTransactionCount === 0`): the caption reads
  "Ninguna transacción será afectada."; the delete/rename still proceeds — an
  empty category is still removable/renamable.
- A category propose left unconfirmed across a page load: out of scope here; see
  the `2026-05-18-stale-mutation-confirmation` spec.

## Testing

- `apps/api`: unit-test `ProposeCategoryChange` with `bun:test`, consistent with
  the existing `propose-mutation.use-case.test.ts` and the project decision to
  ship `apps/api` tests. Cases: accepts a custom category and returns the right
  `affectedTransactionCount` (counting base-category and override-pointed
  transactions, honoring the resolver); returns `0` for an empty custom category;
  rejects a default category; rejects an unknown name; rejects a rename whose
  target collides; rejects a `newName` outside 1–24 characters; allows a rename to
  the same normalized name.
- `apps/ai` / `apps/ui`: no automated tests — no harness, and LLM output is
  non-deterministic (`PRODUCT.md`). Manual verification:
  1. "borrá animales" → a card renders with the transaction-count caption and two
     buttons. Tap "Sí, borrala" → category deleted, content moved to `otros`.
  2. "renombrá animales a bichos" → card with caption referencing `bichos`. Tap
     "Sí, renombrala" → category renamed, cascade applied.
  3. Tap "Cancelar", or send an unrelated message after the card → nothing is
     deleted or renamed.
  4. "borrá comida" (a default) → agent refuses in text, no card.
  5. Delete a freshly created empty category → caption reads "Ninguna transacción
     será afectada.", delete still succeeds.
  6. Transaction delete still shows its plain card with no caption — unchanged.

## Known limitation — agent may skip the card on a repeat request

The confirmation card depends on the agent choosing to call the read-only
`proposeCategoryChange` tool. Unlike `proposeTransactionMutation` (which the agent
*needs* to locate the target transaction), a category delete/rename can be
fulfilled without the tool — the agent already has the category name and can ask
for confirmation conversationally.

When a prior delete/rename exchange for the same category sits in the agent's
recent messages or `semanticRecall` (e.g. the user deletes a category, cancels,
then asks again), the agent may shortcut the tool call — it re-states the
affected-transaction count from memory and asks "¿querés proceder?" as plain
text. No tool call means no `optionPills` attachment, so no card renders.

Mitigation in place: `instructions.ts` (CATEGORIES + MUTATIONS sections) and the
`proposeCategoryChange` tool description forcefully require a fresh tool call on
every request, including repeats, and forbid asking for confirmation in plain
text. This makes the first-time path reliable and reduces — but does not provably
eliminate — the skip on an immediate repeat.

When the card is skipped the mutation still works correctly: the agent asks in
text, and on an affirmative reply calls `deleteCategory` / `renameCategory`. Only
the card is lost, not the action. A fully robust fix would require not depending
on the agent electing to call a separate UI-only tool — out of scope here.
