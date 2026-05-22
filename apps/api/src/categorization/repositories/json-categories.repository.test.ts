import { test, expect, beforeEach } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonCategoriesRepository } from './json-categories.repository';

let dir: string;
let file: string;
let repo: JsonCategoriesRepository;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cats-'));
  file = path.join(dir, 'custom-categories.json');
  repo = new JsonCategoriesRepository(file);
});

test('reads old string[] format as { name, description: "" }[]', async () => {
  await fs.writeFile(file, JSON.stringify(['bocata', 'regalos']));
  expect(await repo.all()).toEqual([
    { name: 'bocata', description: '' },
    { name: 'regalos', description: '' },
  ]);
});

test('reads new {name, description}[] format unchanged', async () => {
  await fs.writeFile(file, JSON.stringify([{ name: 'bocata', description: 'sándwiches' }]));
  expect(await repo.all()).toEqual([{ name: 'bocata', description: 'sándwiches' }]);
});

test('add appends and persists in the new format', async () => {
  await fs.writeFile(file, JSON.stringify(['bocata']));
  await repo.add('regalos', 'cumpleaños y aniversarios');
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(raw).toEqual([
    { name: 'bocata', description: '' },
    { name: 'regalos', description: 'cumpleaños y aniversarios' },
  ]);
});

test('add is idempotent', async () => {
  await repo.add('regalos', 'a');
  await repo.add('regalos', 'b');
  expect(await repo.all()).toEqual([{ name: 'regalos', description: 'a' }]);
});

test('setDescription updates an existing category', async () => {
  await repo.add('regalos', 'inicial');
  await repo.setDescription('regalos', 'cumpleaños');
  expect(await repo.all()).toEqual([{ name: 'regalos', description: 'cumpleaños' }]);
});

test('setDescription on missing category is a no-op', async () => {
  await repo.setDescription('regalos', 'cumpleaños');
  expect(await repo.all()).toEqual([]);
});

test('rename preserves description', async () => {
  await repo.add('mascotas', 'gatos, perros, veterinario');
  await repo.rename('mascotas', 'animales');
  expect(await repo.all()).toEqual([{ name: 'animales', description: 'gatos, perros, veterinario' }]);
});

test('remove drops the entry including its description', async () => {
  await repo.add('mascotas', 'gatos');
  await repo.remove('mascotas');
  expect(await repo.all()).toEqual([]);
});
