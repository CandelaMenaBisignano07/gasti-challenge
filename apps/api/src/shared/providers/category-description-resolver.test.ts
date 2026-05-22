import { test, expect } from 'bun:test';
import { CategoryDescriptionResolver } from './category-description-resolver';
import { CategoryRegistry } from './category-registry';
import { DomainError } from '../domain/domain-error';
import { fakeCategoriesRepo, fakeDefaultCategoryOverridesRepo } from '../testing/fakes';

function make(opts: {
  customs?: Array<string | { name: string; description: string }>;
  overrides?: Record<string, string>;
} = {}) {
  const customsRepo = fakeCategoriesRepo(opts.customs ?? []);
  const defaultsRepo = fakeDefaultCategoryOverridesRepo(opts.overrides ?? {});
  const registry = new CategoryRegistry(customsRepo);
  return new CategoryDescriptionResolver(customsRepo, defaultsRepo, registry);
}

test('resolve returns the seed for a default with no override', async () => {
  const r = make();
  const d = await r.resolve('comida');
  expect(d).toContain('Restaurantes');
});

test('resolve returns the override for a default that has one', async () => {
  const r = make({ overrides: { comida: 'solo restaurantes' } });
  expect(await r.resolve('comida')).toBe('solo restaurantes');
});

test('resolve returns the custom description', async () => {
  const r = make({ customs: [{ name: 'mascotas', description: 'gatos y perros' }] });
  expect(await r.resolve('mascotas')).toBe('gatos y perros');
});

test('resolve returns "" for a custom with empty description', async () => {
  const r = make({ customs: ['mascotas'] });
  expect(await r.resolve('mascotas')).toBe('');
});

test('resolve throws NOT_FOUND for an unknown name', async () => {
  const r = make();
  await expect(r.resolve('inexistente')).rejects.toThrow(DomainError);
});

test('resolveAll lists defaults first then customs', async () => {
  const r = make({
    customs: [{ name: 'mascotas', description: 'gatos' }],
    overrides: { comida: 'solo restaurantes' },
  });
  const all = await r.resolveAll();
  expect(all.length).toBe(8);
  expect(all[0]).toEqual({ name: 'comida', description: 'solo restaurantes', isCustom: false });
  expect(all[6]).toEqual({ name: 'otros', description: expect.any(String), isCustom: false });
  expect(all[7]).toEqual({ name: 'mascotas', description: 'gatos', isCustom: true });
});
