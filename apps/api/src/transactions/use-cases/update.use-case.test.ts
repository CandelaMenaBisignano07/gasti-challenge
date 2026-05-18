import { test, expect } from 'bun:test';
import { UpdateTransaction } from './update.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo, fakeTransactionsRepo } from '../../shared/testing/fakes';
import { transactionSchema, type Transaction } from '../../shared/domain/transaction';

const seed: Transaction = transactionSchema.parse({
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: 'Almuerzo',
  merchant: 'Rappi',
});

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('update applies the given fields to an existing transaction', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  const { transaction } = await useCase.execute({
    transactionId: 'txn_001',
    fields: { amount: 5000 },
  });
  expect(transaction.amount).toBe(5000);
});

test('update accepts a custom category from the registry', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  const { transaction } = await useCase.execute({
    transactionId: 'txn_001',
    fields: { category: 'mascotas' },
  });
  expect(transaction.category).toBe('mascotas');
});

test('update rejects an unknown category', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  await expect(
    useCase.execute({ transactionId: 'txn_001', fields: { category: 'inventada' } }),
  ).rejects.toThrow(DomainError);
});

test('update on an unknown id throws NOT_FOUND', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]), registry());
  await expect(
    useCase.execute({ transactionId: 'txn_999', fields: { amount: 1 } }),
  ).rejects.toThrow(DomainError);
});
