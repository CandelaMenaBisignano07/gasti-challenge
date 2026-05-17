import { test, expect } from 'bun:test';
import { SumByCategory } from './sum-by-category.use-case';
import { GetSpendingBreakdown } from './breakdown.use-case';
import { GetTopMerchants } from './top-merchants.use-case';
import { CompareSpending } from './compare.use-case';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const tx = (
  id: string,
  date: string,
  amount: number,
  category: Transaction['category'],
  merchant: string,
): Transaction => ({ id, date, amount, currency: 'ARS', category, description: '', merchant });

const seed: Transaction[] = [
  tx('txn_001', '2026-05-02', 4000, 'comida', 'Rappi'),
  tx('txn_002', '2026-05-03', 6000, 'comida', 'Coto'),
  tx('txn_003', '2026-05-04', 2000, 'transporte', 'Uber'),
  tx('txn_004', '2026-04-10', 9000, 'comida', 'Coto'),
];

const periods = new PeriodResolver(fixedClock('2026-05-17'));
const categories = new CategoryResolver(fakeCategorizationRepo());

test('sum-by-category totals one category for the current month', async () => {
  const result = await new SumByCategory(fakeTransactionsRepo(seed), periods, categories).execute({
    category: 'comida',
    period: { kind: 'currentMonth' },
  });
  expect(result).toEqual({ category: 'comida', total: 10000, transactionCount: 2 });
});

test('breakdown ranks categories by total with shares summing to 1', async () => {
  const result = await new GetSpendingBreakdown(fakeTransactionsRepo(seed), periods, categories).execute({
    period: { kind: 'currentMonth' },
  });
  expect(result.total).toBe(12000);
  expect(result.breakdown[0]).toEqual({ category: 'comida', total: 10000, share: 10000 / 12000 });
});

test('top-merchants ranks merchants by total spend', async () => {
  const result = await new GetTopMerchants(fakeTransactionsRepo(seed), periods).execute({
    period: { kind: 'currentMonth' },
  });
  expect(result.merchants[0]).toEqual({ merchant: 'Coto', total: 6000, transactionCount: 1 });
});

test('compare reports per-category deltas between two periods', async () => {
  const result = await new CompareSpending(fakeTransactionsRepo(seed), periods, categories).execute({
    periodA: { kind: 'calendarMonth', month: '2026-04' },
    periodB: { kind: 'calendarMonth', month: '2026-05' },
  });
  expect(result.totalA).toBe(9000);
  expect(result.totalB).toBe(12000);
  const comida = result.categories.find((c) => c.category === 'comida');
  expect(comida).toEqual({ category: 'comida', totalA: 9000, totalB: 10000, delta: 1000, deltaPct: (1000 / 9000) * 100 });
});

test('an override moves spend into the corrected category', async () => {
  const withOverride = new CategoryResolver(
    fakeCategorizationRepo({ merchants: { Uber: 'comida' } }),
  );
  const result = await new SumByCategory(fakeTransactionsRepo(seed), periods, withOverride).execute({
    category: 'comida',
    period: { kind: 'currentMonth' },
  });
  expect(result.total).toBe(12000);
});
