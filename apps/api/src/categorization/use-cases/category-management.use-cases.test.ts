import { test, expect } from 'bun:test';
import { CreateCategory } from './create-category.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo } from '../../shared/testing/fakes';

test('create-category normalizes the name and persists it', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  const result = await useCase.execute({ name: '  Mascotas ' });
  expect(result).toEqual({ name: 'mascotas' });
  expect(await repo.all()).toEqual(['mascotas']);
});

test('create-category rejects a name that collides with a default', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await expect(useCase.execute({ name: 'Comida' })).rejects.toThrow(DomainError);
});

test('create-category rejects a name that collides with an existing custom category', async () => {
  const repo = fakeCategoriesRepo(['mascotas']);
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await expect(useCase.execute({ name: 'mascotas' })).rejects.toThrow(DomainError);
});

test('create-category rejects a blank or over-long name', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  await expect(useCase.execute({ name: '   ' })).rejects.toThrow(DomainError);
  await expect(useCase.execute({ name: 'x'.repeat(25) })).rejects.toThrow(DomainError);
});
