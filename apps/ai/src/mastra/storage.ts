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
