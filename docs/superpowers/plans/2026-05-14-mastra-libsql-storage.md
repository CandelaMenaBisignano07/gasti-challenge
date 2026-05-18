# Mastra libSQL Storage Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a local file-backed libSQL storage adapter into the Mastra registry so that Mastra-managed memory and state (threads, messages, workflow snapshots, traces, scores) persist to a dedicated file.

**Architecture:** Infrastructure wiring only. A small factory module (`apps/ai/src/mastra/storage.ts`) reads `DATABASE_FILE` from env, normalizes it to an absolute libSQL URL with a sensible default, and returns a `LibSQLStore` instance. The Mastra registry (`apps/ai/src/mastra/index.ts`) stays thin: it calls the factory and passes the result into `new Mastra({ storage })`. No `Memory` is configured, no agent is touched, no domain code is added.

**Tech Stack:** Bun workspaces · Mastra `^0.10` · `@mastra/libsql` (new) · TypeScript ESM · Node `path`.

**Spec:** [`docs/superpowers/specs/2026-05-14-mastra-libsql-storage-design.md`](../specs/2026-05-14-mastra-libsql-storage-design.md)

**Testing note:** PRODUCT.md declares tests are not a deliverable for this project. Verification in this plan is therefore **runtime-behavioral** (boot the app, inspect the filesystem, check `git status`) rather than test-suite based. No test files are created.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `apps/ai/package.json` | Modify | Add `@mastra/libsql`, bump `@mastra/core` + `mastra` to 1.x |
| `apps/ai/src/mastra/agents/index.ts` | Modify | Adopt Mastra 1.x Agent API (explicit `id`) |
| `CLAUDE.md` (root) | Modify | Update stack notes line to reflect Mastra 1.x |
| `.gitignore` (root) | Modify | Ignore local `.db` files and SQLite WAL sidecars |
| `apps/ai/.env.example` | Modify | Document `DATABASE_FILE` |
| `apps/ai/src/mastra/storage.ts` | **Create** | LibSQLStore factory: read env, resolve URL, build store |
| `apps/ai/src/mastra/index.ts` | Modify | Call factory, pass to `new Mastra({ storage })` |

Task order: dependency → version migration (1.x) → safety net (gitignore) → docs (env example) → code module → wiring + end-to-end verification.

**Note on Task 1b:** It was inserted after the original Task 1 commit landed, when a peer-dependency mismatch surfaced during code-quality review. See the rationale at the top of Task 1b.

---

### Task 1: Install `@mastra/libsql`

**Files:**
- Modify: `apps/ai/package.json` (via `bun add`)
- Modify: `bun.lock` (root, regenerated automatically)

- [ ] **Step 1: Add the dependency to the `ai` workspace**

```bash
bun add @mastra/libsql@latest --filter=ai
```

Expected: bun resolves a recent `@mastra/libsql` version and writes it under `dependencies` in `apps/ai/package.json`. `bun.lock` updates.

- [ ] **Step 2: Verify the dependency landed in the right workspace**

```bash
grep -A1 '"@mastra/libsql"' apps/ai/package.json
```

Expected output (version may differ):

```
    "@mastra/libsql": "^0.x.y",
```

Confirm: nothing got added to root `package.json` or to other workspaces.

- [ ] **Step 3: Verify the package resolves**

```bash
ls node_modules/@mastra/libsql/package.json
```

Expected: file exists.

- [ ] **Step 4: Commit**

```bash
git add apps/ai/package.json bun.lock
git commit -m "feat(ai): add @mastra/libsql dependency"
```

---

### Task 1b: Migrate `apps/ai` to Mastra 1.x

**Why this task exists:** Task 1 installed `@mastra/libsql@1.10.1`, which declares a peer dependency `@mastra/core >=1.32.0`. The project scaffold pinned `@mastra/core@^0.10.0` and `mastra@^0.4.0`. `bun` permitted the install but the resulting tree is incompatible — `LibSQLStore` (1.x) and `@mastra/core` (0.10) cannot interoperate at runtime. `@mastra/libsql` has no 0.x release, so the only path forward is to upgrade `apps/ai` to Mastra 1.x.

**Files:**
- Modify: `apps/ai/package.json`
- Modify: `apps/ai/src/mastra/agents/index.ts`
- Modify: `CLAUDE.md` (root — stack notes line)
- Modify: `bun.lock` (regenerated automatically)

- [ ] **Step 1: Bump `@mastra/core` and `mastra` to 1.x**

```bash
bun add @mastra/core@^1.33.0 mastra@^1.9.0 --filter=ai
```

Expected: `apps/ai/package.json` has `"@mastra/core": "^1.33.0"` and `"mastra": "^1.9.0"`. `bun.lock` updates. No peer-dep warnings about `@mastra/libsql` after this.

- [ ] **Step 2: Verify peer deps are now satisfied**

```bash
bun install 2>&1 | grep -i "peer\|warn" | head -5
```

Expected: no warnings mentioning `@mastra/libsql` and `@mastra/core` incompatibility. (Empty output is fine.)

- [ ] **Step 3: Update the placeholder agent for Mastra 1.x**

Overwrite `apps/ai/src/mastra/agents/index.ts` with this exact content:

```ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

export const placeholderAgent = new Agent({
  id: 'placeholder-agent',
  name: 'Placeholder Agent',
  instructions: 'You are a placeholder agent. Replace me.',
  model: openai('gpt-4o-mini'),
});
```

**What changed:** added explicit `id`. In Mastra 1.x `id` and `name` are separate fields (`id` is unique identifier; `name` is display label). `id` defaults to `name` if omitted, so the previous code would not crash, but being explicit is the documented pattern.

- [ ] **Step 4: Typecheck the workspace**

```bash
cd apps/ai && bunx tsc --noEmit -p tsconfig.json && cd ../..
```

Expected: no errors.

- [ ] **Step 5: Update CLAUDE.md stack notes**

In `CLAUDE.md`, find the line:

```
- **Mastra `^0.10`** + `@ai-sdk/openai` in `apps/ai`.
```

Replace with:

```
- **Mastra `^1.33`** (`@mastra/core`) + `mastra@^1.9` CLI + `@mastra/libsql` + `@ai-sdk/openai` in `apps/ai`.
```

- [ ] **Step 6: Commit**

```bash
git add apps/ai/package.json apps/ai/src/mastra/agents/index.ts CLAUDE.md bun.lock
git commit -m "chore(ai): migrate to Mastra 1.x for libSQL compatibility"
```

---

### Task 2: Ignore local `.db` files

Done **before** writing any code that could create a `.db`, so that an accidental run never tracks it.

**Files:**
- Modify: `.gitignore` (root)

- [ ] **Step 1: Read the current root `.gitignore`**

Expected: contains sections for `# deps`, `# turbo / next / nest / mastra build outputs`, `# env`, `# logs`, `# editor / OS`, `# coverage / cache`, `# per-user agent / skill tooling`.

- [ ] **Step 2: Append the libSQL storage section to the end of `.gitignore`**

Add exactly this block at the end of the file (one blank line before it):

```
# Mastra local storage (libSQL)
.gasti/
*.db
*.db-journal
*.db-wal
*.db-shm
```

Rationale: `.gasti/` is the default directory for the default DB path. `*.db` covers any other configured path. The `-journal`, `-wal`, `-shm` patterns cover SQLite/libSQL sidecar files (created automatically in WAL mode).

- [ ] **Step 3: Verify the patterns work**

```bash
git check-ignore -v .gasti/mastra.db apps/ai/foo.db apps/ai/foo.db-wal
```

Expected: each line matched by a `.gitignore` rule (no "not ignored" output).

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore Mastra libSQL local files"
```

---

### Task 3: Document `DATABASE_FILE` in `.env.example`

**Files:**
- Modify: `apps/ai/.env.example`

- [ ] **Step 1: Read the current file**

Expected current contents:

```
OPENAI_API_KEY=
```

- [ ] **Step 2: Overwrite `apps/ai/.env.example` with this exact content**

```
OPENAI_API_KEY=

# Mastra storage (libSQL). Accepts:
#   - filesystem path (relative or absolute): ./.gasti/mastra.db, /var/data/gasti.db
#   - libSQL-native URL: file:./mastra.db, libsql://..., :memory:
# Empty or absent → default ./.gasti/mastra.db (resolved from the process cwd).
DATABASE_FILE=
```

- [ ] **Step 3: Commit**

```bash
git add apps/ai/.env.example
git commit -m "docs(ai): document DATABASE_FILE env var"
```

---

### Task 4: Create the LibSQLStore factory

> **Post-implementation correction:** Task 5 verification revealed the factory below is buggy. `mastra dev` runs the bundled app with `process.cwd()` set to an internal serving dir (`src/mastra/public`), not the package root, so cwd-relative resolution put the DB in the wrong place; and libSQL does not create the parent directory, causing `SQLITE_CANTOPEN`. The shipped `storage.ts` anchors relative paths to the nearest `package.json` and `mkdir`s the parent. See commit `fix(ai): anchor libSQL storage to package root and ensure its directory exists`.

**Files:**
- Create: `apps/ai/src/mastra/storage.ts`

- [ ] **Step 1: Create `apps/ai/src/mastra/storage.ts` with this exact content**

```ts
import { LibSQLStore } from '@mastra/libsql';
import path from 'node:path';

const DEFAULT_RELATIVE_PATH = '.gasti/mastra.db';
const LIBSQL_NATIVE_PREFIXES = ['file:', 'libsql://', ':memory:'];

function resolveDbUrl(): string {
  const target = process.env.DATABASE_FILE || DEFAULT_RELATIVE_PATH;

  if (LIBSQL_NATIVE_PREFIXES.some(p => target.startsWith(p))) {
    return target;
  }

  const absolute = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  return `file:${absolute}`;
}

export function buildMastraStorage() {
  return new LibSQLStore({
    id: 'gasti-storage',
    url: resolveDbUrl(),
  });
}
```

**Behavior:**
- Empty / unset `DATABASE_FILE` → default `./.gasti/mastra.db` (resolved to absolute via `process.cwd()`).
- Filesystem path → normalized to absolute, prefixed with `file:`.
- libSQL-native URL (`file:…`, `libsql://…`, `:memory:`) → passed through unchanged.

- [ ] **Step 2: Verify TypeScript can resolve the module's imports**

```bash
cd apps/ai && bunx tsc --noEmit -p tsconfig.json && cd ../..
```

Expected: no errors. (`storage.ts` is not yet imported anywhere, but it must typecheck in isolation.)

- [ ] **Step 3: Commit**

```bash
git add apps/ai/src/mastra/storage.ts
git commit -m "feat(ai): add LibSQLStore factory"
```

---

### Task 5: Wire storage into the Mastra registry + verify end-to-end

**Files:**
- Modify: `apps/ai/src/mastra/index.ts`

- [ ] **Step 1: Read current `apps/ai/src/mastra/index.ts`**

Expected current contents:

```ts
import { Mastra } from '@mastra/core';
import { placeholderAgent } from './agents';

export const mastra = new Mastra({
  agents: { placeholderAgent },
});
```

- [ ] **Step 2: Overwrite with this exact content**

```ts
import { Mastra } from '@mastra/core';
import { placeholderAgent } from './agents';
import { buildMastraStorage } from './storage';

export const mastra = new Mastra({
  agents: { placeholderAgent },
  storage: buildMastraStorage(),
});
```

- [ ] **Step 3: Typecheck the workspace**

```bash
cd apps/ai && bunx tsc --noEmit -p tsconfig.json && cd ../..
```

Expected: no errors.

- [ ] **Step 4: Boot `mastra dev` and confirm it starts cleanly**

```bash
bun dev --filter=ai
```

Expected: Mastra dev playground starts without storage-related errors. Kill it with Ctrl+C after the boot log settles (~5 s). Note: a missing `OPENAI_API_KEY` warning is unrelated to storage and is OK at this stage.

- [ ] **Step 5: Confirm the default DB file was created**

```bash
ls apps/ai/.gasti/
```

Expected: at least one of `mastra.db`, `mastra.db-journal`, `mastra.db-wal`, `mastra.db-shm` is present.

- [ ] **Step 6: Confirm git is not tracking the DB**

```bash
git status --short
```

Expected: empty output (the `.gasti/` directory is ignored).

- [ ] **Step 7: Override-path smoke check**

```bash
DATABASE_FILE=:memory:  bun dev --filter=ai
```

Expected: starts without errors. Kill with Ctrl+C. No new files appear under `apps/ai/.gasti/` for this run (in-memory).

- [ ] **Step 8: Commit**

```bash
git add apps/ai/src/mastra/index.ts
git commit -m "feat(ai): wire libSQL storage into Mastra registry"
```

---

## Done definition

After Task 5 all of the following hold:

1. `apps/ai/package.json` lists `@mastra/libsql` as a dependency.
2. Root `.gitignore` ignores `.gasti/`, `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm`.
3. `apps/ai/.env.example` documents `DATABASE_FILE`.
4. `apps/ai/src/mastra/storage.ts` exports `buildMastraStorage()`.
5. `apps/ai/src/mastra/index.ts` passes `buildMastraStorage()` into `new Mastra({ storage })`.
6. `bun dev --filter=ai` starts cleanly and creates the DB file at the configured path.
7. `git status` is clean after running the agent.
8. Branch has one commit per task since the spec commit, plus the inserted Task 1b and a follow-up `fix(ai)` commit that corrected the storage factory after Task 5 verification surfaced a runtime bug.

## Out of scope (do NOT do here)

- Configuring `Memory` on any agent.
- Setting `workingMemory`, `semanticRecall`, or `lastMessages`.
- Adding a vector store.
- Creating feature folders (`transactions/`, `budgets/`, …) or domain/use-case files.
- Touching `data/transactions.json` or any domain repository.
- Reading or transforming the seed JSON dataset.

All of the above are tracked in `PRODUCT.md` and will get their own specs + plans.
