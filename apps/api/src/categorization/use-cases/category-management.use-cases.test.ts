import { test, expect } from 'bun:test';
import { CreateCategory } from './create-category.use-case';
import { RenameCategory } from './rename-category.use-case';
import { DeleteCategory } from './delete-category.use-case';
import { ListCategories } from './list-categories.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import {
  fakeBudgetsRepo,
  fakeCategoriesRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
} from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const tx = (id: string, category: string): Transaction => ({
  id,
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category,
  description: '',
  merchant: 'Coto',
});

test('create-category normalizes the name and persists it', async () => {
  const repo = fakeCategoriesRepo();
  const useCase = new CreateCategory(repo, new CategoryRegistry(repo));
  const result = await useCase.execute({ name: '  Mascotas ' });
  expect(result).toEqual({ name: 'mascotas' });
  expect(await repo.all()).toEqual([{ name: 'mascotas', description: '' }]);
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

test('rename-category cascades into transactions, overrides and budgets', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const txs = fakeTransactionsRepo([tx('txn_001', 'mascotas'), tx('txn_002', 'comida')]);
  const overrides = fakeCategorizationRepo({
    merchants: { 'Pet Shop': 'mascotas' },
    transactions: { txn_003: 'mascotas' },
  });
  const budgets = fakeBudgetsRepo({ '2026-05': { mascotas: 10000 } });
  const useCase = new RenameCategory(categories, txs, overrides, budgets, new CategoryRegistry(categories));

  const result = await useCase.execute({ from: 'mascotas', to: 'Animales' });

  expect(result).toEqual({ from: 'mascotas', to: 'animales' });
  expect(await categories.all()).toEqual([{ name: 'animales', description: '' }]);
  expect((await txs.all()).find((t) => t.id === 'txn_001')?.category).toBe('animales');
  expect((await overrides.overrides()).merchants['Pet Shop']).toBe('animales');
  expect((await overrides.overrides()).transactions.txn_003).toBe('animales');
  expect(await budgets.forMonth('2026-05')).toEqual({ animales: 10000 });
});

test('rename-category rejects renaming a default category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new RenameCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ from: 'comida', to: 'comidas' })).rejects.toThrow(DomainError);
});

test('rename-category rejects an unknown source category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new RenameCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ from: 'inexistente', to: 'algo' })).rejects.toThrow(DomainError);
});

test('rename-category rejects a target that collides with an existing category', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const useCase = new RenameCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ from: 'mascotas', to: 'Comida' })).rejects.toThrow(DomainError);
});

test('rename-category treats a rename to the same normalized name as a no-op', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const useCase = new RenameCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  const result = await useCase.execute({ from: 'mascotas', to: 'Mascotas' });
  expect(result).toEqual({ from: 'mascotas', to: 'mascotas' });
  expect(await categories.all()).toEqual([{ name: 'mascotas', description: '' }]);
});

test('delete-category falls everything back to otros and removes the category', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const txs = fakeTransactionsRepo([tx('txn_001', 'mascotas'), tx('txn_002', 'comida')]);
  const overrides = fakeCategorizationRepo({
    merchants: { 'Pet Shop': 'mascotas' },
    transactions: { txn_003: 'mascotas' },
  });
  const budgets = fakeBudgetsRepo({ '2026-05': { mascotas: 10000, comida: 50000 } });
  const useCase = new DeleteCategory(categories, txs, overrides, budgets, new CategoryRegistry(categories));

  const result = await useCase.execute({ name: 'Mascotas' });

  expect(result).toEqual({ name: 'mascotas' });
  expect(await categories.all()).toEqual([]);
  expect((await txs.all()).find((t) => t.id === 'txn_001')?.category).toBe('otros');
  expect((await overrides.overrides()).merchants['Pet Shop']).toBe('otros');
  expect((await overrides.overrides()).transactions.txn_003).toBe('otros');
  expect(await budgets.forMonth('2026-05')).toEqual({ comida: 50000 });
});

test('delete-category rejects deleting a default category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new DeleteCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ name: 'comida' })).rejects.toThrow(DomainError);
});

test('delete-category rejects an unknown category', async () => {
  const categories = fakeCategoriesRepo();
  const useCase = new DeleteCategory(
    categories,
    fakeTransactionsRepo(),
    fakeCategorizationRepo(),
    fakeBudgetsRepo(),
    new CategoryRegistry(categories),
  );
  await expect(useCase.execute({ name: 'inexistente' })).rejects.toThrow(DomainError);
});

test('list-categories returns defaults then custom, flagged by isCustom', async () => {
  const categories = fakeCategoriesRepo(['mascotas']);
  const result = await new ListCategories(categories, new CategoryRegistry(categories)).execute();
  expect(result.categories).toEqual([
    { name: 'comida', isCustom: false },
    { name: 'transporte', isCustom: false },
    { name: 'entretenimiento', isCustom: false },
    { name: 'salud', isCustom: false },
    { name: 'servicios', isCustom: false },
    { name: 'educacion', isCustom: false },
    { name: 'otros', isCustom: false },
    { name: 'mascotas', isCustom: true },
  ]);
});
