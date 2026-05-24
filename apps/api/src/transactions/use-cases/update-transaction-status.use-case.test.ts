import { test, expect } from 'bun:test';
import { UpdateTransactionStatus } from './update-transaction-status.use-case';
import { fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
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

test('updates status, statusDetail and stamps statusChangedAt', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const useCase = new UpdateTransactionStatus(repo, fixedClock('2026-05-18'));

  await useCase.execute({
    transactionId: 'txn_001',
    newStatus: 'refunded',
    newStatusDetail: 'refunded',
  });

  const tx = await repo.getById('default-user', 'txn_001');
  expect(tx?.status).toBe('refunded');
  expect(tx?.statusDetail).toBe('refunded');
  expect(tx?.statusChangedAt).toBe('2026-05-18T12:00:00.000Z');
});

test('accepts null statusDetail and persists it', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const useCase = new UpdateTransactionStatus(repo, fixedClock('2026-05-18'));

  await useCase.execute({
    transactionId: 'txn_001',
    newStatus: 'active',
    newStatusDetail: null,
  });

  const tx = await repo.getById('default-user', 'txn_001');
  expect(tx?.statusDetail).toBeNull();
});

test('is a no-op for an unknown transaction id', async () => {
  const repo = fakeTransactionsRepo([seed]);
  const useCase = new UpdateTransactionStatus(repo, fixedClock('2026-05-18'));

  await useCase.execute({
    transactionId: 'txn_999',
    newStatus: 'charged_back',
    newStatusDetail: 'in_process',
  });

  const tx = await repo.getById('default-user', 'txn_001');
  expect(tx?.status).toBe('active');
});
