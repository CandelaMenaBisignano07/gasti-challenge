import { test, expect } from 'bun:test';
import { AddTransaction } from './add.use-case';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';

test('add defaults the date to today and currency to ARS', async () => {
  const repo = fakeTransactionsRepo();
  const useCase = new AddTransaction(
    repo,
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
  );
  const { transaction } = await useCase.execute({
    amount: 3000,
    description: 'Café',
    merchant: 'Starbucks',
    category: 'comida',
  });
  expect(transaction.date).toBe('2026-05-17');
  expect(transaction.currency).toBe('ARS');
  expect((await repo.all())).toHaveLength(1);
});

test('add falls back to a merchant rule, then to otros', async () => {
  const withRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo({ merchants: { Coderhouse: 'educacion' } })),
    fixedClock('2026-05-17'),
  );
  const ruled = await withRule.execute({ amount: 50000, description: 'Curso', merchant: 'Coderhouse' });
  expect(ruled.transaction.category).toBe('educacion');

  const noRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
  );
  const unruled = await noRule.execute({ amount: 1000, description: 'X', merchant: 'Desconocido' });
  expect(unruled.transaction.category).toBe('otros');
});
