import { test, expect } from 'bun:test';
import { transactionSchema } from './transaction';

test('parses a transaction with the new canceled status', () => {
  const tx = transactionSchema.parse({
    id: 'txn_001',
    date: '2026-05-23',
    amount: 1000,
    currency: 'ARS',
    category: 'comida',
    description: 'pago cancelado',
    merchant: 'X',
    status: 'canceled',
    statusDetail: 'by_payer',
  });
  expect(tx.status).toBe('canceled');
  expect(tx.statusDetail).toBe('by_payer');
});

test('statusDetail defaults to null on legacy rows', () => {
  const tx = transactionSchema.parse({
    id: 'txn_002',
    date: '2026-05-23',
    amount: 1000,
    currency: 'ARS',
    category: 'comida',
    description: 'legacy',
    merchant: 'X',
  });
  expect(tx.statusDetail).toBeNull();
});
