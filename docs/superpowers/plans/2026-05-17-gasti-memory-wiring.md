# Gasti Memory Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Mastra `Memory` instance (`lastMessages` + `semanticRecall` + `workingMemory`) and connect it to the Gasti agent.

**Architecture:** A `Memory` factory composes the three-layer model. `semanticRecall` uses a `LibSQLVector` over the same `.db` file the storage adapter already resolves; `workingMemory` uses a Zod schema for the four-mirror contract. The factory is wired into `makeGastiAgent` at the composition root (`mastra/index.ts`), replacing the `memory: undefined` placeholder.

**Tech Stack:** Mastra 1.x (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`), `ModelRouterEmbeddingModel`, Zod, Bun.

---

## Testing note

`PRODUCT.md` states tests are not a deliverable, and explicitly says **not** to unit-test Mastra tools or the agent. `apps/ai` has no test suite. Per the design spec (§6), verification is `bunx tsc --noEmit` for type safety plus a manual Mastra Studio walkthrough. Each task below verifies with a typecheck; Task 6 is the manual walkthrough. No test files are created.

All commands run from the worktree root: `C:\Users\Usuario\Desktop\gasti-challenge\.claude\worktrees\ai-memory`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/ai/package.json` | Declares the `@mastra/memory` dependency (modify) |
| `apps/ai/src/mastra/storage.ts` | libSQL persistence factories — gains `buildMastraVector()` (modify) |
| `apps/ai/src/mastra/working-memory.schema.ts` | The four-mirror working-memory Zod schema (create) |
| `apps/ai/src/mastra/memory.ts` | `buildGastiMemory()` — composes the `Memory` primitive (create) |
| `apps/ai/src/mastra/index.ts` | Composition root — wires `buildGastiMemory()` into the agent (modify) |
| `apps/ai/.env.example` | Comment update — `OPENAI_API_KEY` also feeds the embedder (modify) |

---

## Task 1: Add the `@mastra/memory` dependency

**Files:**
- Modify: `apps/ai/package.json`

- [ ] **Step 1: Install the package**

Run from the worktree root:

```bash
bun add @mastra/memory@latest --filter=ai
```

Expected: `bun install` resolves, `@mastra/memory` is added to `apps/ai/package.json` dependencies, `bun.lock` updates.

- [ ] **Step 2: Verify the dependency landed**

Run: `cat apps/ai/package.json`
Expected: `dependencies` now contains `"@mastra/memory"` alongside `@mastra/core`, `@mastra/libsql`, `mastra`, `zod`.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/package.json bun.lock
git commit -m "chore(ai): add @mastra/memory dependency"
```

---

## Task 2: Add `buildMastraVector()` to `storage.ts`

**Files:**
- Modify: `apps/ai/src/mastra/storage.ts`

The file currently exports only `buildMastraStorage()` and keeps `resolveDbUrl()` / `ensureParentDir()` private. Add a vector factory that reuses both helpers, so messages, working memory, and embeddings share one `.db` file.

- [ ] **Step 1: Widen the `@mastra/libsql` import**

Change line 1 of `apps/ai/src/mastra/storage.ts` from:

```ts
import { LibSQLStore } from '@mastra/libsql';
```

to:

```ts
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
```

- [ ] **Step 2: Add the `buildMastraVector()` factory**

Append to the end of `apps/ai/src/mastra/storage.ts`, after the existing `buildMastraStorage()` function:

```ts
/** Vector store for semantic recall — shares the same libSQL file as the store. */
export function buildMastraVector() {
  const url = resolveDbUrl();
  ensureParentDir(url);

  return new LibSQLVector({
    id: 'gasti-vector',
    url,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no new errors from `storage.ts`. (A pre-existing error in `src/shared/interface/create-gateway-tool.ts` is unrelated and present on the base branch — ignore it.)

- [ ] **Step 4: Commit**

```bash
git add apps/ai/src/mastra/storage.ts
git commit -m "feat(ai): add libSQL vector factory for semantic recall"
```

---

## Task 3: Create the working-memory schema

**Files:**
- Create: `apps/ai/src/mastra/working-memory.schema.ts`

The four-mirror contract from the agent-module spec §8, as a Zod schema. Reuses `categorySchema` from `shared/domain/category.ts`. All fields optional — the agent fills them incrementally; Mastra schema merge semantics preserve untouched fields.

- [ ] **Step 1: Create the schema file**

Create `apps/ai/src/mastra/working-memory.schema.ts` with exactly:

```ts
import { z } from 'zod';
import { categorySchema } from '../shared/domain/category';

/**
 * Working-memory mirror — the small, always-relevant slice of user state the
 * agent keeps in context for cheap proactivity. The apps/api DB is the source
 * of truth; this mirror is refreshed via Mastra's updateWorkingMemory tool.
 * Categorization overrides are deliberately excluded (they grow unbounded and
 * are resolved server-side). See 2026-05-17-gasti-memory-design.md §4.
 */
export const workingMemorySchema = z.object({
  userProfile: z
    .object({
      displayName: z.string().optional(),
    })
    .optional(),
  budgets: z
    .array(
      z.object({
        category: categorySchema,
        amount: z.number(),
      }),
    )
    .optional(),
  goals: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        targetAmount: z.number(),
        targetDate: z.string(),
      }),
    )
    .optional(),
  income: z
    .object({
      recurringMonthly: z.number().optional(),
    })
    .optional(),
});
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no new errors. The import `../shared/domain/category` resolves (`categorySchema` is exported there).

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/mastra/working-memory.schema.ts
git commit -m "feat(ai): add working-memory schema for the four-mirror contract"
```

---

## Task 4: Create the `Memory` factory

**Files:**
- Create: `apps/ai/src/mastra/memory.ts`

Composes the `Memory` primitive: `vector` from Task 2, embedder via the model router, `options` for the three layers. `storage` is intentionally omitted — `Memory` inherits the `Mastra`-level `storage: buildMastraStorage()` set in `index.ts`.

- [ ] **Step 1: Create the memory factory file**

Create `apps/ai/src/mastra/memory.ts` with exactly:

```ts
import { Memory } from '@mastra/memory';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { buildMastraVector } from './storage';
import { workingMemorySchema } from './working-memory.schema';

/**
 * Builds the Gasti agent's Memory: short-term history, resource-scoped
 * semantic recall, and a resource-scoped working-memory mirror.
 * Storage is inherited from the Mastra-level `storage` — not passed here.
 * See 2026-05-17-gasti-memory-design.md.
 */
export function buildGastiMemory() {
  return new Memory({
    vector: buildMastraVector(),
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    options: {
      lastMessages: 20,
      semanticRecall: { topK: 3, messageRange: 2, scope: 'resource' },
      workingMemory: {
        enabled: true,
        schema: workingMemorySchema,
        scope: 'resource',
      },
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no new errors. `Memory`, `ModelRouterEmbeddingModel`, `buildMastraVector`, and `workingMemorySchema` all resolve.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/mastra/memory.ts
git commit -m "feat(ai): add Gasti Memory factory"
```

---

## Task 5: Wire `Memory` into the composition root

**Files:**
- Modify: `apps/ai/src/mastra/index.ts`
- Modify: `apps/ai/.env.example`

- [ ] **Step 1: Add the `buildGastiMemory` import**

In `apps/ai/src/mastra/index.ts`, add this import immediately after the existing `import { buildMastraStorage } from './storage';` line:

```ts
import { buildGastiMemory } from './memory';
```

- [ ] **Step 2: Pass the real `Memory` to the agent**

In `apps/ai/src/mastra/index.ts`, replace these two lines:

```ts
// Memory is built in a separate worktree; the agent runs with or without it.
const gasti = makeGastiAgent({ tools, memory: undefined });
```

with:

```ts
const gasti = makeGastiAgent({ tools, memory: buildGastiMemory() });
```

- [ ] **Step 3: Update the `.env.example` comment**

In `apps/ai/.env.example`, replace this line:

```
# LLM provider key for the Gasti agent
```

with:

```
# LLM provider key for the Gasti agent (also feeds the semantic-recall embedder)
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/ai && bunx tsc --noEmit`
Expected: no new errors. The only error remains the pre-existing one in `src/shared/interface/create-gateway-tool.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/src/mastra/index.ts apps/ai/.env.example
git commit -m "feat(ai): connect Memory to the Gasti agent"
```

---

## Task 6: Manual verification in Mastra Studio

**Files:** none — verification only.

No automated tests (per `PRODUCT.md`). Walk through the design spec §6 checklist.

- [ ] **Step 1: Ensure the env file exists**

Confirm `apps/ai/.env` exists with a real `OPENAI_API_KEY`. If absent, copy it:

```bash
cp apps/ai/.env.example apps/ai/.env
```

Then edit `apps/ai/.env` and set `OPENAI_API_KEY` to a valid key.

- [ ] **Step 2: Boot the Mastra dev playground**

Run from the worktree root: `bun dev --filter=ai`
Expected: `mastra dev` boots with no errors; the Gasti agent is reachable in Studio (default `http://localhost:4111`).

- [ ] **Step 3: Verify the build is clean**

In a second terminal, run from the worktree root: `bun run build --filter=ai`
Expected: the build completes with no errors.

- [ ] **Step 4: Verify resource-scoped working memory**

In Studio, open a chat with Gasti. Tell it a display name (e.g. *"me llamo Cande"*). Open a **new thread** and ask it your name. Expected: the agent recalls it — working memory is resource-scoped, so it crosses threads.

- [ ] **Step 5: Verify the working-memory mirror updates**

In a thread, set a budget (e.g. *"ponele 50000 a comida"*). Open Studio's working-memory panel. Expected: the `budgets` array holds `{ category: "comida", amount: 50000 }`.

- [ ] **Step 6: Verify `lastMessages` and `semanticRecall`**

Within a thread, ask a follow-up using a pronoun referring to the previous message — the agent resolves it (`lastMessages`). After many turns, ask about something discussed earlier and outside the 20-message window; the recalled message appears in the Studio trace (`semanticRecall`).

- [ ] **Step 7: Verify the storage file exists**

After the first interaction, run: `ls apps/ai/.gasti`
Expected: `mastra.db` exists (or the path set by `DATABASE_FILE`). It is gitignored — `git status` shows no `.db` noise.

- [ ] **Step 8: Commit verification notes (optional)**

If verification surfaced no issues, no commit is needed. If a fix was required, commit it with a `fix(ai):` message describing the correction.

---

## Self-Review

**Spec coverage:**
- §2.1 `@mastra/memory` dependency → Task 1.
- §2.2 `LibSQLVector` on the same `.db` → Task 2.
- §2.3 embedder via `ModelRouterEmbeddingModel` → Task 4.
- §2.4 working memory as Zod schema → Task 3.
- §2.5 `scope: 'resource'` for both layers → Task 4 (`semanticRecall.scope`, `workingMemory.scope`).
- §2.6 `Memory` inherits Mastra-level storage → Task 4 (no `storage` arg) — noted in the file comment.
- §2.7 tuning (`lastMessages: 20`, `topK: 3`, `messageRange: 2`) → Task 4.
- §4 four-mirror schema → Task 3.
- §5 all six files touched → Tasks 1–5.
- §6 manual verification → Task 6.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every command shows expected output.

**Type consistency:** `buildMastraVector` (Task 2) is imported and called in Task 4; `workingMemorySchema` (Task 3) is imported and used in Task 4; `buildGastiMemory` (Task 4) is imported and called in Task 5. `categorySchema` matches the export in `shared/domain/category.ts`. Names are consistent across tasks.

---

## References

- `docs/superpowers/specs/2026-05-17-gasti-memory-design.md` — the design this plan implements.
- `docs/superpowers/specs/2026-05-15-gasti-agent-module-design.md` §8 — the Memory seam contract.
- `docs/superpowers/specs/2026-05-14-mastra-libsql-storage-design.md` — the `storage.ts` this plan extends.
