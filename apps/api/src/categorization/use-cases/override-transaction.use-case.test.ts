import { test, expect } from 'bun:test';
import { OverrideTransactionCategory } from './override-transaction.use-case';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategorizationRepo, fakeTransactionsRepo } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const seed: Transaction = {
  id: 'txn_001',
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category: 'otros',
  description: '',
  merchant: 'Farmacity',
};

test('override-transaction persists the exception for an existing tx', async () => {
  const cat = fakeCategorizationRepo();
  const useCase = new OverrideTransactionCategory(cat, fakeTransactionsRepo([seed]));
  await useCase.execute({ transactionId: 'txn_001', category: 'salud' });
  expect((await cat.overrides()).transactions.txn_001).toBe('salud');
});

test('override-transaction on an unknown id throws NOT_FOUND', async () => {
  const useCase = new OverrideTransactionCategory(fakeCategorizationRepo(), fakeTransactionsRepo([seed]));
  await expect(
    useCase.execute({ transactionId: 'txn_999', category: 'salud' }),
  ).rejects.toThrow(DomainError);
});
