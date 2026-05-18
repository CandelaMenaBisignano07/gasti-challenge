# Transaction Tags — Design

**Date:** 2026-05-18
**Status:** Approved (pending spec review)

## Summary

Let the user attach personalized, free-form **tags** to transactions through
conversation, then query and aggregate spending by tag. A transaction can carry
several tags. Tags are orthogonal to the fixed `category` enum — they do not
affect category resolution, budgets, or insights.

Examples: `vacaciones`, `reembolsable`, `regalo`, `trabajo`.

## Scope

In scope:

- Attach / remove tags on a transaction.
- List all distinct tags with their transaction counts.
- List transactions carrying a tag (with optional period filter) and aggregate
  the total + count for that tag — answering both "show me" and "how much".
- Render tags as pills wherever a transaction list is shown in the chat UI.

Out of scope:

- Tagging by selector (merchant / period) — the agent resolves a transaction id
  with existing read tools first, then tags by id.
- Tag-based budgets or insights.
- Renaming or merging tags as a first-class operation.

## Approach

A new `tags/` feature in `apps/api` and `apps/ai`, persisting a sidecar
`data/transaction-tags.json` keyed by transaction id. This mirrors the existing
`categorization` feature exactly (`data/category-overrides.json`) and leaves the
fixed transaction schema untouched.

Rejected alternatives:

- **`tags` field on the `Transaction` entity** — `PRODUCT.md` fixes the
  transaction schema (`id, date, amount, currency, category, description,
  merchant`); `categorization` itself chose a sidecar over mutating
  transactions.
- **Mastra working memory** — breaks the "domain lives behind repositories in
  api/ai" boundary; `categorization`'s real implementation already moved off
  working memory to a JSON repo.

## Data model

- `TransactionTags = Record<string, string[]>` — transaction id → tag list.
  Default `{}`.
- A tag is a free-form string, **normalized** before storage: trimmed,
  internal whitespace collapsed to single spaces, lowercased, and deduped per
  transaction.
- Schema caps: tag length ≤ 30 characters; ≤ 10 tags per transaction.
- After normalization, empty tags are dropped. If a `TagTransaction` request
  yields no valid tags, it is rejected with a `DomainError`.

## `apps/api` — new `tags/` feature

Feature folder `apps/api/src/tags/`, following Clean Architecture layering.

### domain

`domain/transaction-tags.repository.ts`:

- `TAGS_REPOSITORY` injection token.
- `TransactionTags` type and `EMPTY_TAGS = {}` constant.
- `TransactionTagsRepository` interface:
  - `all(): Promise<TransactionTags>`
  - `addTags(transactionId: string, tags: string[]): Promise<void>`
  - `removeTags(transactionId: string, tags: string[]): Promise<void>`

### repositories

`repositories/json-transaction-tags.repository.ts` — `JsonTransactionTagsRepository`
implementing the interface via `createJsonStore` against
`data/transaction-tags.json`, defaulting to `{}`. Read-modify-write per
mutation, matching `JsonCategorizationRepository`.

### use-cases

One use-case per intent, depending on interfaces only:

- `TagTransaction` — input `{ transactionId, tags: string[] }`. Verifies the
  transaction exists via `TransactionsRepository.all()`; throws `DomainError`
  if not. Normalizes/dedupes the tags, drops empties, rejects if none remain,
  calls `repo.addTags`. Returns `{ transactionId, tags }` where `tags` is the
  transaction's full tag list after the change.
- `UntagTransaction` — input `{ transactionId, tags?: string[] }`. Removes the
  given normalized tags; if `tags` is omitted, removes all tags from the
  transaction. Returns the remaining tag list.
- `ListTags` — no input. Returns `{ tags: { tag: string; count: number }[] }`,
  sorted by count descending. **Counts only reference live transactions** —
  tags whose transaction id no longer exists (deleted transactions) are
  excluded by cross-referencing `TransactionsRepository.all()`. This keeps the
  feature decoupled: the transactions delete use-case is never touched.
- `ListTransactionsByTag` — input `{ tag: string; period?: Period }`. Returns
  `{ tag, transactions: Transaction[], total: number, count: number }`.
  Transactions matching the (normalized) tag are filtered by period when
  given, sorted by date descending, and have their category resolved via
  `CategoryResolver` (same shape as `ListTransactions`). `total` is the sum of
  amounts; `count` is the number of matches.

### interface

- `interface/tags.controller.ts` — `@Controller('tags')`, thin POST handlers:
  - `POST /tags/add` → `TagTransaction`
  - `POST /tags/remove` → `UntagTransaction`
  - `POST /tags/list` → `ListTags`
  - `POST /tags/by-tag` → `ListTransactionsByTag`
- `interface/tags.schemas.ts` — zod input schemas with the caps above, used
  with `ZodValidationPipe`.

### module

`tags.module.ts` — imports `TransactionsModule` (for `TRANSACTIONS_REPOSITORY`)
and `SharedModule` (for `PeriodResolver`, `CategoryResolver`); `providers`
binds `TAGS_REPOSITORY` to `JsonTransactionTagsRepository` and registers the
four use-cases; `controllers: [TagsController]`. Registered in `app.module.ts`.

### Spending integration (tags everywhere)

So tag pills appear in every transaction list — not only tag queries — the
spending `ListTransactions` use-case is enriched: inject
`TransactionTagsRepository`, and map each returned transaction to include its
`tags` array. `ProposeTransactionMutation` matches stay plain (a transient
confirmation flow). The `Transaction` shape returned by these use-cases gains
an optional `tags?: string[]`.

## `apps/ai` — new `tags/` feature

Feature folder `apps/ai/src/tags/`, mirroring `apps/ai/src/categorization/`.

- `domain/tags.gateway.ts` — zod input/output schemas + `TagsGateway`
  interface (`tag`, `untag`, `listTags`, `byTag`).
- `providers/http-tags.gateway.ts` — `makeHttpTagsGateway(api)` via
  `makeHttpGateway`, mapping methods to `/tags/add`, `/tags/remove`,
  `/tags/list`, `/tags/by-tag`.
- `interface/tags.tools.ts` — `makeTagsTools(gateway)` exposing four tools via
  `createGatewayTool`:
  - `tagTransaction` — attach tags. Non-destructive, no confirmation (like
    `addTransaction`).
  - `untagTransaction` — remove tags. Non-destructive.
  - `listTags` — list all tags with counts.
  - `listTransactionsByTag` — query + aggregate; `transform` produces a
    `transactionList` attachment from `output.transactions`.
- Wire `makeTagsTools(makeHttpTagsGateway(api))` into `mastra/index.ts`.

### Agent instructions

Add a short section to `apps/ai/src/agent/instructions.ts`: tags are free-form
labels distinct from categories; to tag, first resolve the transaction id with
a read tool, then call `tagTransaction`; tagging needs no confirmation; use
`listTransactionsByTag` for "how much did I spend on X" tag questions.

## `apps/ui` — tag pills

- `apps/ui/src/transactions/domain/transaction.ts` — `Transaction` type gains
  optional `tags?: string[]`.
- New `TagPills` component (e.g. `apps/ui/src/transactions/components/tag-pills.tsx`),
  styled per `DESIGN.md` token system, rendered inside `TransactionRow` when
  the transaction has tags. Renders nothing when `tags` is empty/absent.
- The `transactionList` message attachment already carries `Transaction[]`;
  with the api change above, tags flow through automatically.

## Error handling

- Tagging a non-existent transaction → `DomainError`, surfaced via the existing
  `domain-exception.filter.ts`.
- Whitespace-only / empty tags → normalized away; a request with no valid tags
  left → `DomainError`.
- Duplicate tags on the same transaction → deduped silently.
- Removing a tag the transaction does not have → no-op, success.
- Orphaned tag entries (transaction later deleted) → excluded from `ListTags`
  counts and `ListTransactionsByTag` results by cross-referencing live
  transactions.

## Testing

`apps/api` ships tests (bun:test), covering use-case external behavior:

- `TagTransaction` — normalization, dedupe, unknown-transaction `DomainError`,
  empty-after-normalization rejection.
- `UntagTransaction` — remove subset, remove-all, remove-missing no-op.
- `ListTags` — counts, descending sort, orphan exclusion.
- `ListTransactionsByTag` — tag match, period filter, `total`/`count`.

A fake `TransactionTagsRepository` is added to `shared/testing/fakes.ts`.
Mastra tools and the agent are not tested (thin shells / non-deterministic).
