# Design — Mastra libSQL Storage Wiring

**Date:** 2026-05-14
**Scope:** `apps/ai` — wire a local file-backed storage adapter into the Mastra registry.
**Status:** Approved for planning.

---

## Goal

Give Mastra a dedicated local file to persist memory and state (threads, messages, workflow snapshots, traces, scores). The choice of adapter is `@mastra/libsql` — the only Mastra-supported provider that runs as a single local file without an external database server. Mastra does **not** ship a JSON-file adapter; libSQL is the official path for "local file" persistence.

This change is **infrastructure wiring only**. It does not introduce `Memory`, does not modify the agent, and does not touch features (transactions, budgets, etc.).

## Non-goals

- Creating or configuring a `Memory` instance on any agent.
- Configuring `workingMemory`, `semanticRecall`, or `lastMessages` (deferred to the implementation plan per `PRODUCT.md`).
- Touching `data/transactions.json` or any domain repository — that file is read by a (future) domain repository, not by Mastra storage.
- Splitting `apps/ai` into feature folders (`transactions/`, `budgets/`, …).

## Decisions

1. **Adapter: `@mastra/libsql` → `LibSQLStore`.** File-backed, local, no separate server. Officially recommended by the Mastra docs for local setups.
2. **Path resolution: env-driven (`DATABASE_FILE`) with a sensible default.**
   - Accepts a filesystem path (relative or absolute), a libSQL-native URL (`file:…`, `libsql://…`, `:memory:`), or empty/absent.
   - Filesystem paths are normalized to **absolute** before constructing the URL — Mastra docs warn that relative paths break when `mastra dev` (Studio) and other processes have different working directories.
   - Default: `./.gasti/mastra.db` (resolved from `process.cwd()`).
3. **Scope: storage wiring only.** `Memory` and tuning are deferred.
4. **Folder layout: flat.** `storage.ts` sits next to `mastra/index.ts`. No `infrastructure/` folder is introduced yet (YAGNI — `apps/ai` has no features yet). Convention will be revisited when feature folders land.

## Architecture alignment (Clean Architecture per CLAUDE.md)

- `storage.ts` is **infrastructure** — imports `@mastra/libsql` and `node:path`, no domain logic.
- `mastra/index.ts` is the **Mastra registry**, explicitly listed as infrastructure in CLAUDE.md. Stays thin: it composes.
- Domain is untouched. No domain code imports framework symbols.
- **DI:** `new LibSQLStore(...)` is constructed in the composition root (the registry, via the factory). The DI rule prohibits instantiating concretes inside use-cases or inside a tool's `execute` — not inside the composition root, where wiring belongs.
- **Mastra primitives only:** uses `LibSQLStore`, no custom abstraction.
- `LibSQLStore` is a **framework persistence primitive**, not a domain repository. The "repositories are contracts first" rule applies to domain repositories (future `TransactionsRepository`, etc.), not to Mastra's internal storage adapter. No domain interface is needed.

## Files touched

```
apps/ai/
├── package.json                  # +@mastra/libsql
├── .env.example                  # +DATABASE_FILE
└── src/mastra/
    ├── index.ts                  # wires storage into new Mastra({ storage })
    └── storage.ts                # NEW — LibSQLStore factory reading env
.gitignore                        # ignore local .db and SQLite sidecars
```

## Implementation

### `apps/ai/src/mastra/storage.ts` (new)

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
- `DATABASE_FILE` empty / unset → default `./.gasti/mastra.db` from cwd.
- Filesystem path (relative or absolute) → normalized to absolute, prefixed with `file:`.
- libSQL-native URL (`file:…`, `libsql://…`, `:memory:`) → passed through unchanged.

### `apps/ai/src/mastra/index.ts` (modified)

```ts
import { Mastra } from '@mastra/core';
import { placeholderAgent } from './agents';
import { buildMastraStorage } from './storage';

export const mastra = new Mastra({
  agents: { placeholderAgent },
  storage: buildMastraStorage(),
});
```

### `apps/ai/.env.example` (modified)

```
OPENAI_API_KEY=

# Mastra storage (libSQL). Accepts:
#   - filesystem path (relative or absolute): ./.gasti/mastra.db, /var/data/gasti.db
#   - libSQL-native URL: file:./mastra.db, libsql://..., :memory:
# Empty or absent → default ./.gasti/mastra.db (resolved from the process cwd).
DATABASE_FILE=
```

### Root `.gitignore` (modified)

Append:

```
# Mastra local storage (libSQL)
.gasti/
*.db
*.db-journal
*.db-wal
*.db-shm
```

The `*-journal`, `*-wal`, `*-shm` patterns cover SQLite/libSQL WAL-mode sidecar files.

### Installation

```bash
bun add @mastra/libsql@latest --filter=ai
```

## Verification

- `bun install` succeeds with `@mastra/libsql` resolved in `apps/ai`.
- `bun dev --filter=ai` boots `mastra dev` without errors.
- After the first agent interaction, `apps/ai/.gasti/mastra.db` (or the env-configured path) is created.
- Overriding `DATABASE_FILE=/absolute/path/to/x.db` in `apps/ai/.env` redirects the file.
- Setting `DATABASE_FILE=:memory:` runs without writing to disk.
- `git status` shows no `.db` / `.gasti/` noise (confirmed gitignored).

## Deferred to the implementation plan

- `Memory` primitive on the agent (`workingMemory` template, `semanticRecall`, `lastMessages` tuning).
- Vector store for `semanticRecall` (libSQL Vector is the likely choice, but separate decision).
- Feature folders (`transactions/`, `budgets/`, `income/`, `categorization/`, `insights/`) with their `domain/`, `use-cases/`, `repositories/`, `providers/`.
- Tools wrapping use-cases.
