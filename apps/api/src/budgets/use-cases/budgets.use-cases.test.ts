import { test, expect } from 'bun:test';
import { SetBudget } from './set-budget.use-case';
import { GetBudgetProgress } from './budget-progress.use-case';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo } from '../../shared/testing/fakes';
import {
  fakeBudgetsRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
  fixedClock,
} from '../../shared/testing/fakes';
import type { Category } from '../../shared/domain/category';
import { transactionSchema, type Transaction } from '../../shared/domain/transaction';

const tx = (id: string, date: string, amount: number): Transaction =>
  transactionSchema.parse({
    id,
    date,
    amount,
    currency: 'ARS',
    category: 'comida',
    description: '',
    merchant: 'Coto',
  });

test('set-budget stores the amount under the current month', async () => {
  const repo = fakeBudgetsRepo();
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const result = await new SetBudget(repo, fixedClock('2026-05-17'), registry).execute({
    category: 'comida',
    amount: 50000,
  });
  expect(result).toEqual({ category: 'comida', amount: 50000, month: '2026-05' });
  expect(await repo.forMonth('2026-05')).toEqual({ comida: 50000 });
});

test('set-budget accepts a custom category', async () => {
  const repo = fakeBudgetsRepo();
  const registry = new CategoryRegistry(fakeCategoriesRepo(['mascotas']));
  await new SetBudget(repo, fixedClock('2026-05-17'), registry).execute({
    category: 'mascotas',
    amount: 8000,
  });
  expect(await repo.forMonth('2026-05')).toEqual({ mascotas: 8000 });
});

test('set-budget rejects an unknown category', async () => {
  const registry = new CategoryRegistry(fakeCategoriesRepo());
  const useCase = new SetBudget(fakeBudgetsRepo(), fixedClock('2026-05-17'), registry);
  await expect(useCase.execute({ category: 'inventada', amount: 1000 })).rejects.toThrow(DomainError);
});

test('budget-progress reports spend, remaining and pace', async () => {
  const budgets = fakeBudgetsRepo({ '2026-05': { comida: 50000 } });
  const txs = fakeTransactionsRepo([tx('txn_001', '2026-05-03', 8000), tx('txn_002', '2026-05-08', 12000)]);
  const result = await new GetBudgetProgress(
    budgets,
    txs,
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-10'),
  ).execute({});
  expect(result.items).toHaveLength(1);
  expect(result.items[0].spent).toBe(20000);
  expect(result.items[0].remaining).toBe(30000);
  expect(result.items[0].pace).toBe('over');
});
