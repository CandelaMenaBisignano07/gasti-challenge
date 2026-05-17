import { test, expect } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createJsonStore } from './json-store';

test('read returns the fallback when the file is absent', async () => {
  const file = path.join(os.tmpdir(), `gasti-jsonstore-${Date.now()}-a.json`);
  const store = createJsonStore<{ count: number }>(file, { count: 0 });
  expect(await store.read()).toEqual({ count: 0 });
});

test('write then read round-trips the data', async () => {
  const file = path.join(os.tmpdir(), `gasti-jsonstore-${Date.now()}-b.json`);
  const store = createJsonStore<{ count: number }>(file, { count: 0 });
  await store.write({ count: 7 });
  expect(await store.read()).toEqual({ count: 7 });
  await fs.rm(file, { force: true });
});
