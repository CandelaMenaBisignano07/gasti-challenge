import { test, expect } from 'bun:test';
import { UpdateTransaction } from './update.use-case';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeTransactionsRepo } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const seed: Transaction = {
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: 'Almuerzo',
  merchant: 'Rappi',
};

test('update applies the given fields', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]));
  const { transaction } = await useCase.execute({ transactionId: 'txn_001', fields: { amount: 2500 } });
  expect(transaction.amount).toBe(2500);
  expect(transaction.merchant).toBe('Rappi');
});

test('update on an unknown id throws NOT_FOUND', async () => {
  const useCase = new UpdateTransaction(fakeTransactionsRepo([seed]));
  await expect(
    useCase.execute({ transactionId: 'txn_999', fields: { amount: 1 } }),
  ).rejects.toThrow(DomainError);
});
