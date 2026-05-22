import { test, expect, beforeEach } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonDefaultCategoryOverridesRepository } from './json-default-category-overrides.repository';

let dir: string;
let file: string;
let repo: JsonDefaultCategoryOverridesRepository;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'def-cat-'));
  file = path.join(dir, 'default-category-overrides.json');
  repo = new JsonDefaultCategoryOverridesRepository(file);
});

test('all returns {} when the file does not exist', async () => {
  expect(await repo.all()).toEqual({});
});

test('set persists a value', async () => {
  await repo.set('comida', 'solo restaurantes, no super');
  expect(await repo.all()).toEqual({ comida: 'solo restaurantes, no super' });
});

test('set overwrites an existing value', async () => {
  await repo.set('comida', 'a');
  await repo.set('comida', 'b');
  expect(await repo.all()).toEqual({ comida: 'b' });
});

test('reset removes a key', async () => {
  await repo.set('comida', 'algo');
  await repo.reset('comida');
  expect(await repo.all()).toEqual({});
});

test('reset on missing key is a no-op', async () => {
  await repo.reset('comida');
  expect(await repo.all()).toEqual({});
});
