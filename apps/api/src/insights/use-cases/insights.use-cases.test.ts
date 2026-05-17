import { test, expect } from 'bun:test';
import { ProjectMonthEnd } from './project-month-end.use-case';
import { DetectRecurringCharges } from './recurring-charges.use-case';
import { DetectCategorySpikes } from './category-spikes.use-case';
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

const categories = new CategoryResolver(fakeCategorizationRepo());

test('project-month-end extrapolates and flags a thin sample', async () => {
  const seed = [tx('txn_001', '2026-05-02', 10000, 'comida', 'Coto')];
  const result = await new ProjectMonthEnd(
    fakeTransactionsRepo(seed),
    categories,
    fixedClock('2026-05-10'),
  ).execute({});
  expect(result.spentSoFar).toBe(10000);
  expect(result.daysElapsed).toBe(10);
  expect(result.daysInMonth).toBe(31);
  expect(result.projectedTotal).toBe(Math.round((10000 / 10) * 31));
  expect(result.caveat).not.toBeNull();
});

test('recurring-charges flags a merchant seen across months with stable amounts', async () => {
  const seed = [
    tx('txn_001', '2026-03-05', 5000, 'entretenimiento', 'Netflix'),
    tx('txn_002', '2026-04-05', 5000, 'entretenimiento', 'Netflix'),
    tx('txn_003', '2026-05-05', 5200, 'entretenimiento', 'Netflix'),
    tx('txn_004', '2026-05-06', 3000, 'comida', 'Rappi'),
  ];
  const result = await new DetectRecurringCharges(
    fakeTransactionsRepo(seed),
    categories,
    fixedClock('2026-05-17'),
  ).execute({});
  expect(result.recurring).toHaveLength(1);
  expect(result.recurring[0].merchant).toBe('Netflix');
  expect(result.recurring[0].occurrences).toBe(3);
});

test('category-spikes flags a category that jumped sharply month-over-month', async () => {
  const seed = [
    tx('txn_001', '2026-04-10', 5000, 'entretenimiento', 'Cine'),
    tx('txn_002', '2026-05-10', 40000, 'entretenimiento', 'Recital'),
  ];
  const result = await new DetectCategorySpikes(
    fakeTransactionsRepo(seed),
    categories,
    fixedClock('2026-05-17'),
  ).execute();
  expect(result.spikes).toHaveLength(1);
  expect(result.spikes[0].category).toBe('entretenimiento');
  expect(result.spikes[0].delta).toBe(35000);
});
