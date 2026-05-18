import { test, expect } from 'bun:test';
import { DeleteTransaction } from './delete.use-case';
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

test('delete removes the transaction and returns its id', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const { deletedId } = await new DeleteTransaction(repo).execute({ transactionId: 'txn_001' });
  expect(deletedId).toBe('txn_001');
  expect(await repo.all()).toHaveLength(0);
});

test('delete on an unknown id throws NOT_FOUND', async () => {
  await expect(
    new DeleteTransaction(fakeTransactionsRepo([seed])).execute({ transactionId: 'txn_999' }),
  ).rejects.toThrow(DomainError);
});
