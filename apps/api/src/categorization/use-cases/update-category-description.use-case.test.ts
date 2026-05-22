import { test, expect } from 'bun:test';
import { UpdateCategoryDescription } from './update-category-description.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo, fakeDefaultCategoryOverridesRepo } from '../../shared/testing/fakes';

function make(opts: {
  customs?: Array<string | { name: string; description: string }>;
  overrides?: Record<string, string>;
} = {}) {
  const customs = fakeCategoriesRepo(opts.customs ?? []);
  const defaults = fakeDefaultCategoryOverridesRepo(opts.overrides ?? {});
  const registry = new CategoryRegistry(customs);
  return { useCase: new UpdateCategoryDescription(customs, defaults, registry), customs, defaults };
}

test('updates the override for a default category', async () => {
  const { useCase, defaults } = make();
  const result = await useCase.execute({ name: 'comida', description: '  solo restaurantes  ' });
  expect(result).toEqual({ name: 'comida', description: 'solo restaurantes' });
  expect(await defaults.all()).toEqual({ comida: 'solo restaurantes' });
});

test('updates the description for a custom category', async () => {
  const { useCase, customs } = make({ customs: ['mascotas'] });
  const result = await useCase.execute({ name: 'mascotas', description: 'gatos y perros' });
  expect(result).toEqual({ name: 'mascotas', description: 'gatos y perros' });
  expect(await customs.all()).toEqual([{ name: 'mascotas', description: 'gatos y perros' }]);
});

test('accepts an empty description (clears it)', async () => {
  const { useCase, customs } = make({ customs: [{ name: 'mascotas', description: 'algo' }] });
  await useCase.execute({ name: 'mascotas', description: '' });
  expect((await customs.all())[0].description).toBe('');
});

test('rejects a description longer than 240 chars', async () => {
  const { useCase } = make();
  await expect(useCase.execute({ name: 'comida', description: 'x'.repeat(241) })).rejects.toThrow(DomainError);
});

test('rejects an unknown category', async () => {
  const { useCase } = make();
  await expect(useCase.execute({ name: 'inexistente', description: 'a' })).rejects.toThrow(DomainError);
});

test('normalizes the category name', async () => {
  const { useCase, defaults } = make();
  await useCase.execute({ name: '  Comida ', description: 'x' });
  expect(await defaults.all()).toEqual({ comida: 'x' });
});
