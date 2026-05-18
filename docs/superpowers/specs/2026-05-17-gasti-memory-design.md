# Design — Gasti Memory Wiring

**Date:** 2026-05-17
**Scope:** `apps/ai` — build the Mastra `Memory` instance and connect it to the Gasti agent.
**Status:** Design approved, ready for implementation plan.
**Companion docs:** [PRODUCT.md](../../../PRODUCT.md), [CLAUDE.md](../../../CLAUDE.md), `2026-05-15-gasti-agent-module-design.md` (§8 — the Memory seam), `2026-05-14-mastra-libsql-storage-design.md` (the storage adapter).

---

## 1. Goal & non-goals

### Goal

Fill the **Memory seam** the agent-module spec left open. That spec (§8) defined the contract — `makeGastiAgent({ tools, memory })` attaches an injected `Memory`, the working-memory mirror holds four pieces of state, scope is resource-level — but explicitly deferred *building* the `Memory` instance to "a parallel worktree". This is that worktree.

Deliver the three-layer memory model `PRODUCT.md` mandates:

- **`lastMessages`** — short-term conversation history.
- **`semanticRecall`** — vector retrieval of older messages by meaning.
- **`workingMemory`** — persistent, structured user state (the §8 four-mirror contract).

### Non-goals

- **The agent factory** — `makeGastiAgent` already accepts and attaches `memory`; built by the agent-module spec. Untouched here beyond the wiring call.
- **Runtime `resourceId` / `threadId` passing** — the caller (`@mastra/client-js` / Mastra Studio / the UI's `HttpChatRepository`) supplies `resource` and `thread` per request. This spec configures `scope: 'resource'`; it does not own request plumbing.
- **The libSQL storage adapter** — `2026-05-14-mastra-libsql-storage-design.md`; this spec depends on it and extends `storage.ts` with a vector factory.
- **Tools, gateways, `apps/api`** — unrelated layers.
- **Observational Memory** — Mastra's compaction feature. `PRODUCT.md` pins the classic three-layer model; Observational Memory is out of scope.
- **Tests** — not a deliverable per `PRODUCT.md`; verification is a manual walkthrough (§6).

### Depends on

The libSQL storage spec (the `storage.ts` factory and resolution helpers) and the agent-module spec (the `memory` injection seam on `makeGastiAgent`).

---

## 2. Decisions

1. **Package: `@mastra/memory`.** The only new dependency. `@mastra/libsql` (provides `LibSQLVector`) and `@mastra/core` (provides `ModelRouterEmbeddingModel`) are already installed.
2. **Vector store: `LibSQLVector`, same `.db` file as the store.** The vector index lives in the same libSQL database `DATABASE_FILE` already resolves — the pattern shown in the Mastra docs. No new env var, one file. A separate vector file was rejected as YAGNI for a single-user app.
3. **Embedder: `ModelRouterEmbeddingModel('openai/text-embedding-3-small')`.** Mastra's model router resolves the embedding model from `OPENAI_API_KEY` — the key the agent already requires. **No `@ai-sdk/openai` dependency** (it was removed during the worktree merge; the model router makes it unnecessary).
4. **Working memory: Zod schema, not Markdown template.** The §8 contract is four structured mirrors. A schema gives type safety and **merge semantics** — the agent updates only the fields that changed after `setBudget` / `setGoal` / `declareIncome`, instead of rewriting a whole text block.
5. **Scope: `resource` for both `workingMemory` and `semanticRecall`.** `resourceId = userId`. Budgets, goals, income, and the display name persist across every conversation; recall reaches past threads (`PRODUCT.md` story 28).
6. **`Memory` inherits the `Mastra`-level `storage`.** `mastra/index.ts` already sets `storage: buildMastraStorage()`. Per the Mastra docs, message history and working memory use that registry-level store; the `Memory` instance is constructed with only `vector`, `embedder`, and `options`. `buildMastraStorage()` is not called twice.
7. **Tuning:** `lastMessages: 20`, `semanticRecall: { topK: 3, messageRange: 2 }`. Twenty messages comfortably spans the two-turn confirmation flow (agent-module spec §7); `topK 3` / `messageRange 2` is the Mastra-documented small-context default.

---

## 3. Architecture alignment (Clean Architecture per CLAUDE.md)

- `mastra/index.ts` is the **composition root / infrastructure** — it composes storage, vector, memory, agent.
- `storage.ts` is **infrastructure** — libSQL persistence wiring. It gains `buildMastraVector()` alongside `buildMastraStorage()`; both are libSQL persistence factories and share the file-resolution helpers, so they belong together (DRY — no duplicated URL resolution).
- `memory.ts` (new) is **infrastructure** — a single factory, `buildGastiMemory()`, that composes the `Memory` primitive.
- `working-memory.schema.ts` (new) is a pure Zod schema — framework-agnostic. It is co-located in `mastra/` with its only consumer (`memory.ts`); the agent-module spec assigns ownership of the working-memory schema to this worktree.
- **Mastra primitives only:** `Memory`, `LibSQLVector`, `ModelRouterEmbeddingModel`. No custom recall loop, no homemade store.
- **DI:** every concrete (`LibSQLVector`, `Memory`) is constructed in the composition root via factories, never inside a tool's `execute` or a use-case — exactly the CLAUDE.md rule.

---

## 4. The working-memory schema

The §8 four-mirror contract, expressed as Zod (`apps/ai/src/mastra/working-memory.schema.ts`):

```ts
import { z } from 'zod';
import { categorySchema } from '../shared/domain/category';

export const workingMemorySchema = z.object({
  userProfile: z.object({
    displayName: z.string().optional(),
  }).optional(),
  budgets: z.array(z.object({
    category: categorySchema,
    amount: z.number(),
  })).optional(),
  goals: z.array(z.object({
    id: z.string(),
    name: z.string(),
    targetAmount: z.number(),
    targetDate: z.string(),
  })).optional(),
  income: z.object({
    recurringMonthly: z.number().optional(),
  }).optional(),
});
```

| Mirror | Holds | Why it is in working memory (§8) |
|---|---|---|
| `userProfile.displayName` | The name the user wants to be addressed by | Per-user, always relevant |
| `budgets` | Active `{category, amount}` for the month | Proactive overrun warnings without a tool call each turn |
| `goals` | Active `{id, name, targetAmount, targetDate}` | Proactive goal-risk warnings need to know a goal exists |
| `income.recurringMonthly` | Declared recurring monthly figure | Framing spend against income |

`categorySchema` is reused from `shared/domain/category.ts` — the same seven-category enum the rest of `apps/ai` uses. All fields are optional: the agent fills them incrementally, and merge semantics preserve untouched fields. **Categorization overrides are deliberately excluded** — §8 keeps them out of working memory (they grow unbounded; `apps/api` resolves them server-side).

---

## 5. Factories & wiring

### `storage.ts` (modified) — add a vector factory

`buildMastraVector()` joins `buildMastraStorage()`, reusing the private `resolveDbUrl()` and `ensureParentDir()`:

```ts
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
// ... existing resolveDbUrl(), ensureParentDir() unchanged ...

export function buildMastraVector() {
  const url = resolveDbUrl();
  ensureParentDir(url);
  return new LibSQLVector({ id: 'gasti-vector', url });
}
```

Same resolved `url` as the store → one `.db` file holds messages, working memory, and embeddings.

### `memory.ts` (new) — the `Memory` factory

```ts
import { Memory } from '@mastra/memory';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { buildMastraVector } from './storage';
import { workingMemorySchema } from './working-memory.schema';

export function buildGastiMemory() {
  return new Memory({
    vector: buildMastraVector(),
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    options: {
      lastMessages: 20,
      semanticRecall: { topK: 3, messageRange: 2, scope: 'resource' },
      workingMemory: { enabled: true, schema: workingMemorySchema, scope: 'resource' },
    },
  });
}
```

No `storage` passed — inherited from the `Mastra`-level `storage: buildMastraStorage()`.

### `index.ts` (modified) — wire it in

The `memory: undefined` placeholder becomes a real instance:

```ts
import { buildGastiMemory } from './memory';
// ...
const gasti = makeGastiAgent({ tools, memory: buildGastiMemory() });
```

The comment "Memory is built in a separate worktree" is removed — this worktree built it.

### `.env.example` (modified)

No new variables. The `OPENAI_API_KEY` comment is updated to note it now also powers the semantic-recall embedder.

### Files touched

```
apps/ai/
├── package.json                       # +@mastra/memory
├── .env.example                       # comment-only: OPENAI_API_KEY also feeds the embedder
└── src/mastra/
    ├── index.ts                        # wire buildGastiMemory() into makeGastiAgent
    ├── storage.ts                      # +buildMastraVector()
    ├── memory.ts                       # NEW — buildGastiMemory()
    └── working-memory.schema.ts        # NEW — the four-mirror Zod schema
```

---

## 6. Verification (manual)

No tests are a deliverable (`PRODUCT.md`); verification is a manual walkthrough in **Mastra Studio** (`bun dev --filter=ai`).

1. `bun dev --filter=ai` boots `mastra dev` with no errors; `bun run build --filter=ai` is clean.
2. The Gasti agent appears in Studio with a memory panel in the right sidebar.
3. **Working memory (resource-scoped):** in one thread, tell the agent a display name; open a *new* thread and confirm the agent still knows it.
4. **Working memory mirror:** run `setBudget` for a category; confirm the `budgets` entry appears in the working-memory JSON. Repeat for a goal and a recurring income.
5. **`lastMessages`:** within a thread, use a pronoun / follow-up referring to the previous message; the agent resolves it.
6. **`semanticRecall`:** after several turns, ask about something discussed earlier and out of the `lastMessages` window; the recalled message appears in the Studio trace.
7. After the first interaction, the libSQL `.db` file (default `apps/ai/.gasti/mastra.db`, or the `DATABASE_FILE` path) exists and holds the message, embedding, and resource tables.

---

## 7. Edge cases

| Case | Behavior |
|---|---|
| `OPENAI_API_KEY` missing | The embedder cannot resolve; `semanticRecall` fails. Same key the agent already needs — surfaced at boot, not a new failure mode. |
| Caller passes no `resource` | Resource-scoped working memory needs a `resource`. The agent-module middleware sets `userId`; the caller maps it to `resource`. Out of this spec's scope, noted as a boundary (§1 non-goals). |
| Schema migration (a mirror field changes later) | Merge semantics tolerate added optional fields. Removing/renaming a field is a future migration concern, out of scope. |
| Embedding latency per turn | `semanticRecall` adds an embedding call before each LLM call. Accepted — `PRODUCT.md` mandates it; single-user scale makes the cost negligible. |

---

## 8. References

- `2026-05-15-gasti-agent-module-design.md` §8 — the Memory seam: injection contract, four-mirror table, resource/thread model.
- `2026-05-14-mastra-libsql-storage-design.md` — the libSQL storage adapter and `storage.ts` this spec extends.
- [PRODUCT.md](../../../PRODUCT.md) §Mastra — mandates `workingMemory` + `semanticRecall` + `lastMessages`; story 27 (display name), story 28 (recall past conversations), story 29 (short-term context).
- [CLAUDE.md](../../../CLAUDE.md) — Clean Architecture layering, Mastra-primitives-only rule, DI rule.
- Mastra MCP (`@mastra/mcp-docs-server`) — `Memory` class reference, working-memory schema mode, semantic-recall embedder via `ModelRouterEmbeddingModel`. Consulted for this design; consult again before implementing.
