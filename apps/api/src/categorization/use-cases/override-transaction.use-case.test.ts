import { test, expect } from 'bun:test';
import { OverrideTransactionCategory } from './override-transaction.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import {
  fakeCategoriesRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
} from '../../shared/testing/fakes';
import { transactionSchema, type Transaction } from '../../shared/domain/transaction';

const seed: Transaction = transactionSchema.parse({
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'otros',
  description: '',
  merchant: 'Farmacity',
});

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('override-transaction persists the exception for an existing tx', async () => {
  const cat = fakeCategorizationRepo();
  const useCase = new OverrideTransactionCategory(cat, fakeTransactionsRepo([seed]), registry());
  await useCase.execute({ transactionId: 'txn_001', category: 'salud' });
  expect((await cat.overrides()).transactions.txn_001).toBe('salud');
});

test('override-transaction accepts a custom category', async () => {
  const cat = fakeCategorizationRepo();
  const useCase = new OverrideTransactionCategory(cat, fakeTransactionsRepo([seed]), registry());
  await useCase.execute({ transactionId: 'txn_001', category: 'mascotas' });
  expect((await cat.overrides()).transactions.txn_001).toBe('mascotas');
});

test('override-transaction on an unknown id throws NOT_FOUND', async () => {
  const useCase = new OverrideTransactionCategory(
    fakeCategorizationRepo(),
    fakeTransactionsRepo([seed]),
    registry(),
  );
  await expect(
    useCase.execute({ transactionId: 'txn_999', category: 'salud' }),
  ).rejects.toThrow(DomainError);
});

test('override-transaction rejects an unknown category', async () => {
  const useCase = new OverrideTransactionCategory(
    fakeCategorizationRepo(),
    fakeTransactionsRepo([seed]),
    registry(),
  );
  await expect(
    useCase.execute({ transactionId: 'txn_001', category: 'inventada' }),
  ).rejects.toThrow(DomainError);
});
