import { test, expect } from 'bun:test';
import { DeclareIncome } from './declare-income.use-case';
import { GetCashFlow } from './cash-flow.use-case';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { IncomeRepository, IncomeStatement } from '../domain/income.repository';
import type { Transaction } from '../../shared/domain/transaction';

function fakeIncomeRepo(seed?: Partial<IncomeStatement>): IncomeRepository {
  const data: IncomeStatement = {
    recurringMonthly: seed?.recurringMonthly ?? null,
    oneOffs: seed?.oneOffs ? [...seed.oneOffs] : [],
  };
  return {
    async get() {
      return { recurringMonthly: data.recurringMonthly, oneOffs: [...data.oneOffs] };
    },
    async setRecurring(amount) {
      data.recurringMonthly = amount;
    },
    async addOneOff(entry) {
      data.oneOffs.push(entry);
    },
  };
}

const tx = (id: string, date: string, amount: number): Transaction => ({
  id,
  date,
  amount,
  currency: 'ARS',
  category: 'comida',
  description: '',
  merchant: 'Coto',
});

test('declare recurring income sets the monthly figure', async () => {
  const repo = fakeIncomeRepo();
  const result = await new DeclareIncome(repo, fixedClock('2026-05-17')).execute({
    kind: 'recurring',
    amount: 1_500_000,
  });
  expect(result).toEqual({ kind: 'recurring', amount: 1_500_000 });
  expect((await repo.get()).recurringMonthly).toBe(1_500_000);
});

test('cash-flow returns a null savings rate when no income is declared', async () => {
  const result = await new GetCashFlow(
    fakeIncomeRepo(),
    fakeTransactionsRepo([tx('txn_001', '2026-05-05', 10000)]),
    new PeriodResolver(fixedClock('2026-05-17')),
  ).execute({ period: { kind: 'month', month: '2026-05' } });
  expect(result.expenses).toBe(10000);
  expect(result.income).toBe(0);
  expect(result.savingsRate).toBeNull();
});

test('cash-flow computes net and savings rate from a full calendar month of recurring income', async () => {
  const result = await new GetCashFlow(
    fakeIncomeRepo({ recurringMonthly: 600_000 }),
    fakeTransactionsRepo([tx('txn_001', '2026-04-05', 300_000)]),
    new PeriodResolver(fixedClock('2026-05-17')),
  ).execute({ period: { kind: 'month', month: '2026-04' } });
  expect(result.income).toBe(600_000);
  expect(result.net).toBe(300_000);
  expect(result.savingsRate).toBe(0.5);
});
