import { test, expect } from 'bun:test';
import { CategoryResolver } from './category-resolver';
import { fakeCategorizationRepo } from '../testing/fakes';
import type { Transaction } from '../domain/transaction';

const tx = (id: string, merchant: string, category: Transaction['category']): Transaction => ({
  id,
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category,
  description: '',
  merchant,
});

test('seed category is used when there is no override', async () => {
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const map = await resolver.resolveAll([tx('txn_001', 'Rappi', 'comida')]);
  expect(map.get('txn_001')).toBe('comida');
});

test('merchant rule overrides the seed category', async () => {
  const resolver = new CategoryResolver(
    fakeCategorizationRepo({ merchants: { Coderhouse: 'educacion' } }),
  );
  const map = await resolver.resolveAll([tx('txn_002', 'Coderhouse', 'otros')]);
  expect(map.get('txn_002')).toBe('educacion');
});

test('transaction override beats the merchant rule', async () => {
  const resolver = new CategoryResolver(
    fakeCategorizationRepo({
      merchants: { Coderhouse: 'educacion' },
      transactions: { txn_003: 'salud' },
    }),
  );
  const map = await resolver.resolveAll([tx('txn_003', 'Coderhouse', 'otros')]);
  expect(map.get('txn_003')).toBe('salud');
});
