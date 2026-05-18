import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface JsonStore<T> {
  read(): Promise<T>;
  write(data: T): Promise<void>;
}

/**
 * File-backed JSON store. `read()` returns a deep clone of `fallback` when the
 * file is absent. `write()` is atomic: it writes a `.tmp` sibling then renames
 * over the target, so a crash never leaves a half-written file.
 */
export function createJsonStore<T>(filePath: string, fallback: T): JsonStore<T> {
  return {
    async read(): Promise<T> {
      try {
        return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return structuredClone(fallback);
        }
        throw err;
      }
    },
    async write(data: T): Promise<void> {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmp, filePath);
    },
  };
}
