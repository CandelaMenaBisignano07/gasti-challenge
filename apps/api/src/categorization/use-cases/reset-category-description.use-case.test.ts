import { test, expect } from 'bun:test';
import { ResetCategoryDescription } from './reset-category-description.use-case';
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
  return { useCase: new ResetCategoryDescription(defaults, registry), customs, defaults };
}

test('removes the override and returns the seed', async () => {
  const { useCase, defaults } = make({ overrides: { comida: 'algo' } });
  const result = await useCase.execute({ name: 'comida' });
  expect(result.name).toBe('comida');
  expect(result.description).toContain('Restaurantes');
  expect(await defaults.all()).toEqual({});
});

test('no-op when the default has no override (returns the seed)', async () => {
  const { useCase } = make();
  const result = await useCase.execute({ name: 'comida' });
  expect(result.description).toContain('Restaurantes');
});

test('rejects a custom category', async () => {
  const { useCase } = make({ customs: ['mascotas'] });
  await expect(useCase.execute({ name: 'mascotas' })).rejects.toThrow(DomainError);
});

test('rejects an unknown name', async () => {
  const { useCase } = make();
  await expect(useCase.execute({ name: 'inexistente' })).rejects.toThrow(DomainError);
});
