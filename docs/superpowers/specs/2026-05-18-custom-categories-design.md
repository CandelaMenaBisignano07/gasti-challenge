# Custom Categories — Design

**Date:** 2026-05-18
**Status:** Approved (pending spec review)

## Summary

Let the user define their own spending categories through conversation, beyond
the seven fixed defaults (`comida, transporte, entretenimiento, salud,
servicios, educacion, otros`). A custom category is **first-class** — identical
in scope and behavior to a core category in every respect. The only
differences: custom categories are user-created, and they can be renamed or
deleted, whereas the seven defaults cannot.

Custom categories appear as a transaction's base category, as override targets,
as budget keys, and in every aggregation (breakdown, comparison, sums,
insights).

## Scope

In scope:

- **Create** a category explicitly ("creá una categoría 'mascotas'").
- **Inline create:** when the user assigns a transaction/merchant to — or adds
  a transaction with — an unknown category name, Gasti offers to create it and
  proceeds on confirmation.
- **Assign** a custom category as a transaction's base category (via
  `addTransaction` / `updateTransaction`) and as a per-merchant or
  per-transaction override (the existing `categorization` tools).
- **Rename** a custom category — existing assignments follow the rename.
- **Delete** a custom category — assignments fall back to `otros`.
- **List** all categories (the seven defaults + custom ones).
- Budgets, breakdowns, comparisons, and insights all work with custom
  categories with no special-casing.

Out of scope (YAGNI):

- Per-custom-category icon selection. Custom categories use the generic `tag`
  fallback icon (`DESIGN.md` already specifies this).
- Marking a custom category "discretionary". Custom categories are
  non-discretionary — they do not affect savings-goal risk. Only the existing
  `entretenimiento` / `otros` defaults are discretionary.
- Editing or deleting the seven default categories.

## Approach

A **category registry**: the seven defaults are built-in; custom categories are
user-defined records persisted in a sidecar `apps/api/data/custom-categories.json`
(mirroring `category-overrides.json`). The set of valid categories is
`defaults ∪ custom`.

Because a category is now open-ended, the hard `categorySchema` Zod enum becomes
an open string, and "is this a valid category?" moves from schema validation to
a **runtime registry check inside use-cases**.

Custom-category management (create / rename / delete / list) is **folded into
the existing `categorization/` feature** in both apps — it is the same bounded
context. New use-cases, controller routes, gateway methods, and tools extend the
files already there; no separate `categories/` feature folder is created.

Rejected alternatives:

- **Custom categories as a separate parallel dimension** — that is the tags
  feature; rejected because the user wants these to *be* categories (appear in
  breakdowns, budgets, comparisons).
- **A larger fixed preset enum** — not "personalized"; rejected.

## The core change: `category` becomes an open string

`categorySchema` is currently `z.enum([...7 values])`. It is used (directly or
via the `Category` type) across both apps — in transactions, spending inputs and
results, budgets, categorization, insights, and goals.

The change:

- `categorySchema` becomes `categoryNameSchema = z.string().min(1)` — a
  normalized, non-empty category name. The `Category` type becomes `string`.
- Schema-level enum validation is removed. **Validity is checked at runtime in
  use-cases** against the `CategoryRegistry`. A use-case that receives an
  unknown category throws a `DomainError` (`VALIDATION_ERROR`).
- This is a wide but mechanical change: every `categorySchema` reference in
  `apps/api` and `apps/ai` switches to the string schema. The exact file list
  is enumerated in the implementation plan.
- `DISCRETIONARY_CATEGORIES` and `isDiscretionary` stay as-is — they reference
  the default slugs by string literal, which remains valid. Custom categories
  are simply never in that set.

## Data model

- **Custom category record:** `{ name: string }` where `name` is a normalized
  slug (trimmed, internal whitespace collapsed, lowercased). The seven defaults
  are already slugs.
- **Storage:** `CustomCategories = string[]` (the list of custom slugs),
  persisted to `apps/api/data/custom-categories.json`, default `[]`.
- **Name normalization:** trim, collapse internal whitespace to single spaces,
  lowercase. Constraints: 1–24 characters after normalization; must not collide
  with an existing category (default or custom).

## `apps/api` — extend the `categorization/` feature

All new files land inside the existing `apps/api/src/categorization/` feature
folder, alongside the override use-cases.

### domain

`shared/domain/custom-categories.ts` (in `shared/domain`, so the `shared`-level
`CategoryRegistry` depends only on a shared contract — exactly as
`CategorizationRepository` lives in `shared/domain/category-overrides.ts`):

- `CATEGORIES_REPOSITORY` injection token.
- `CustomCategories` type (`string[]`) and `EMPTY_CUSTOM_CATEGORIES = []`.
- `CategoriesRepository` interface:
  - `all(): Promise<CustomCategories>` — the custom slugs.
  - `add(name: string): Promise<void>`
  - `remove(name: string): Promise<void>`
  - `rename(from: string, to: string): Promise<void>`

### repositories

`categorization/repositories/json-categories.repository.ts` —
`JsonCategoriesRepository` over `createJsonStore` against
`custom-categories.json`, default `[]`.

### providers

`shared/providers/category-registry.ts` — `CategoryRegistry` provider (placed in
`shared`, alongside `CategoryResolver`, because many features depend on it):

- `all(): Promise<string[]>` — the seven defaults followed by custom slugs.
- `exists(name: string): Promise<boolean>`
- `isCustom(name: string): Promise<boolean>`
- `isDefault(name: string): boolean` — pure check against the default slugs.

The seven default slugs are defined as a constant
(`DEFAULT_CATEGORIES`) in `shared/domain/category.ts`.

`categorization/providers/category-name.ts` — pure `normalizeCategoryName(raw)`
helper (trim, collapse whitespace, lowercase).

### use-cases

These live in `categorization/use-cases/`, alongside the override use-cases.

- `CreateCategory` — input `{ name }`. Normalizes the name, validates length,
  rejects (`DomainError`) if it collides with an existing default or custom
  category, then persists it. Returns the created slug.
- `RenameCategory` — input `{ from, to }`. Both normalized. Rejects if `from`
  is a default, if `from` does not exist as a custom category, or if `to`
  collides. **Cascade:** rewrites every transaction whose base `category` is
  `from` → `to`; rewrites every `categorization` override (merchant and
  transaction) pointing at `from` → `to`; rewrites the budget keyed `from` →
  `to`. Then renames the registry entry.
- `DeleteCategory` — input `{ name }`. Normalized. Rejects if it is a default
  or does not exist. **Cascade:** rewrites every transaction whose base
  `category` is `name` → `otros`; rewrites every override pointing at `name` →
  `otros`; clears the budget keyed `name`. Then removes the registry entry.
- `ListCategories` — no input. Returns `{ categories: { name: string; isCustom:
  boolean }[] }` — the seven defaults followed by custom ones.

`RenameCategory` and `DeleteCategory` depend on `CategoriesRepository`,
`TransactionsRepository`, `CategorizationRepository`, and `BudgetsRepository`
interfaces — a use-case orchestrating several repositories, which Clean
Architecture permits.

### Registry validation in existing use-cases

The category-accepting use-cases gain a `CategoryRegistry` dependency and
validate their category input against it, throwing `DomainError` on an unknown
category:

- `AddTransaction`, `UpdateTransaction` (transactions feature).
- `OverrideMerchantCategory`, `OverrideTransactionCategory` (categorization).
- `SetBudget` (budgets).
- `SumByCategory` (spending) — already filters by an exact category; an
  unknown category simply yields an empty result, but validating gives an
  honest error instead of a silent zero.

### interface

The existing `categorization` interface files are extended — no new files:

- `categorization/interface/categorization.schemas.ts` gains the
  create/rename/delete Zod input schemas.
- `categorization/interface/categorization.controller.ts` (`@Controller(
  'categorization')`) gains four routes: `/categorization/create-category`,
  `/categorization/rename-category`, `/categorization/delete-category`,
  `/categorization/list-categories`.

### module

The four new use-cases are registered in the existing `CategorizationModule`,
which additionally imports `BudgetsModule` (for the cascade). `BudgetsModule`
exports `BUDGETS_REPOSITORY`. `CATEGORIES_REPOSITORY` (bound to
`JsonCategoriesRepository`) and the `CategoryRegistry` provider are added to the
`@Global() SharedModule` so every feature can inject them — mirroring how
`CATEGORIZATION_REPOSITORY` and `CategoryResolver` are already global. No new
module and no `app.module.ts` change (`CategorizationModule` is already
registered).

## `apps/ai` — extend the `categorization/` feature

The existing `apps/ai/src/categorization/` files are extended — no new feature
folder:

- `domain/categorization.gateway.ts` gains the create/rename/delete/list Zod
  schemas and four methods on the `CategorizationGateway` interface (`create`,
  `rename`, `remove`, `list`).
- `providers/http-categorization.gateway.ts` gains the four routes, mapping to
  `/categorization/create-category`, `/categorization/rename-category`,
  `/categorization/delete-category`, `/categorization/list-categories`.
- `interface/categorization.tools.ts` — `makeCategorizationTools` gains four
  tools: `createCategory`, `renameCategory`, `deleteCategory`, `listCategories`.
  Like budgets and overrides, these are direct conversational mutations with no
  proposal/confirmation step; the agent confirms the action plainly afterward.
  `deleteCategory` carries a cascade, so the agent should state plainly what it
  does (assignments fall back to `otros`) before calling it.
- Already wired into `mastra/index.ts` via the existing
  `makeCategorizationTools(...)` call.

Assignment of a custom category to a transaction continues to use the existing
`addTransaction` / `updateTransaction` / `overrideMerchantCategory` /
`overrideTransactionCategory` tools — unchanged in shape, now accepting custom
names validated server-side.

### Agent instructions

The `CATEGORIES` block in `apps/ai/src/agent/instructions.ts` is rewritten:

- The **live category list is interpolated into the system prompt each turn**,
  the way `today` already is. The Mastra `requestContextSchema` and the server
  middleware in `mastra/index.ts` are extended to carry the current category
  list, fetched once per request from the API.
- The rule changes from "There are no others — reject" to: if the user names a
  category not in the current list, **offer to create it**; on an affirmative
  reply call `createCategory`, then proceed with the original assignment. This
  is the inline-create flow — it lives in agent conversation logic, while the
  use-cases reject unknown categories as a server-side safety net.
- `otros` remains the catch-all only when the user explicitly chooses it.

## `apps/ui`

- `CategoryIcon` (`apps/ui/src/shared/icons/category-icon.tsx`) falls back to a
  generic `tag` icon for any category name not in the default icon map. If it
  does not already, it is adjusted to do so.
- The UI `Transaction` type's `category` field is already `Category | string`,
  so custom categories render with the fallback icon and a capitalized label
  with no further change. No other UI work is required.

## Error handling

- Creating a category that collides with an existing default or custom
  category → `DomainError` (`VALIDATION_ERROR`).
- A name that is empty or too long after normalization → `DomainError`.
- Renaming or deleting a default category, or a custom category that does not
  exist → `DomainError` (`NOT_FOUND` / `VALIDATION_ERROR`).
- Assigning a transaction, override, or budget to an unknown category →
  `DomainError`, surfaced through the existing `domain-exception.filter.ts`.
- Delete and rename cascades are best-effort sequential repository writes;
  there is no cross-file transaction (consistent with the existing JSON-store
  architecture).

## Testing

`apps/api` ships tests (bun:test), covering use-case external behavior:

- `normalizeCategoryName` — trim, collapse, lowercase.
- `CreateCategory` — normalization, collision rejection (default and custom),
  length rejection.
- `RenameCategory` — cascade into transactions, overrides, and budget; rejects
  renaming a default and colliding names.
- `DeleteCategory` — cascade fallback to `otros` across transactions, overrides,
  and budget clearing; rejects deleting a default.
- `ListCategories` — defaults plus custom, `isCustom` flag.
- Registry validation added to `AddTransaction` / `OverrideTransactionCategory`
  / `SetBudget` — unknown category throws.

A fake `CategoriesRepository` and a `CategoryRegistry` test helper are added to
`shared/testing/fakes.ts`.

Mastra tools and the agent are not tested (thin shells / non-deterministic).
