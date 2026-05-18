import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_RELATIVE_PATH = '.gasti/mastra.db';
const LIBSQL_NATIVE_PREFIXES = ['file:', 'libsql://', ':memory:'];

/**
 * Directory used to anchor relative storage paths.
 *
 * `mastra dev` runs the bundled app with `process.cwd()` pointing at an
 * internal serving directory (`src/mastra/public`), not the package root —
 * so cwd is not a stable anchor. Walking up to the nearest `package.json`
 * yields the `apps/ai` package root, which is stable across runs.
 */
function findPackageRoot(): string {
  let dir = process.cwd();
  while (!existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd(); // reached fs root: fall back
    dir = parent;
  }
  return dir;
}

function resolveDbUrl(): string {
  const target = process.env.DATABASE_FILE || DEFAULT_RELATIVE_PATH;

  if (LIBSQL_NATIVE_PREFIXES.some(prefix => target.startsWith(prefix))) {
    return target;
  }

  const absolute = path.isAbsolute(target)
    ? target
    : path.join(findPackageRoot(), target);
  return `file:${absolute}`;
}

/** libSQL does not create the parent directory of a file database — do it here. */
function ensureParentDir(url: string): void {
  // `:memory:` and `libsql://` have no local directory to create.
  if (url.startsWith('file://')) {
    mkdirSync(path.dirname(fileURLToPath(url)), { recursive: true });
  } else if (url.startsWith('file:')) {
    mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
  }
}

export function buildMastraStorage() {
  const url = resolveDbUrl();
  ensureParentDir(url);

  return new LibSQLStore({
    id: 'gasti-storage',
    url,
  });
}

/** Vector store for semantic recall — shares the same libSQL file as the store. */
export function buildMastraVector() {
  const url = resolveDbUrl();
  ensureParentDir(url);

  return new LibSQLVector({
    id: 'gasti-vector',
    url,
  });
}
