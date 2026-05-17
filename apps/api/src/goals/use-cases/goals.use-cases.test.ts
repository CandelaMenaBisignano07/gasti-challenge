import { test, expect } from 'bun:test';
import { SetGoal } from './set-goal.use-case';
import { ClearGoal } from './clear-goal.use-case';
import { AssessGoalRisk } from './assess-goal-risk.use-case';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { Goal } from '../../shared/domain/goal';
import type { GoalDraft, GoalsRepository } from '../domain/goals.repository';
import type { IncomeRepository, IncomeStatement } from '../../income/domain/income.repository';
import type { Transaction } from '../../shared/domain/transaction';

function fakeGoalsRepo(seed: Goal[] = []): GoalsRepository {
  let goals = seed.map((g) => ({ ...g }));
  return {
    async all() {
      return goals.map((g) => ({ ...g }));
    },
    async getById(id) {
      return goals.find((g) => g.id === id) ?? null;
    },
    async upsertByName(draft: GoalDraft, createdAt) {
      const i = goals.findIndex((g) => g.name.toLowerCase() === draft.name.toLowerCase());
      let goal: Goal;
      if (i >= 0) {
        goal = { ...goals[i], ...draft };
        goals[i] = goal;
      } else {
        goal = { id: `goal_${String(goals.length + 1).padStart(3, '0')}`, createdAt, ...draft };
        goals.push(goal);
      }
      return { ...goal };
    },
    async delete(id) {
      const before = goals.length;
      goals = goals.filter((g) => g.id !== id);
      return goals.length < before;
    },
  };
}

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

const tx = (id: string, date: string, amount: number, category: Transaction['category']): Transaction => ({
  id,
  date,
  amount,
  currency: 'ARS',
  category,
  description: '',
  merchant: 'X',
});

test('set-goal creates a goal, then updates the same goal by name', async () => {
  const repo = fakeGoalsRepo();
  const useCase = new SetGoal(repo, fixedClock('2026-05-17'));
  const first = await useCase.execute({ name: 'Auto', targetAmount: 8_000_000, targetDate: '2026-12-31' });
  expect(first.goal.id).toBe('goal_001');
  const second = await useCase.execute({ name: 'auto', targetAmount: 9_000_000, targetDate: '2026-12-31' });
  expect(second.goal.id).toBe('goal_001');
  expect(second.goal.targetAmount).toBe(9_000_000);
  expect(await repo.all()).toHaveLength(1);
});

test('clear-goal on an unknown id throws NOT_FOUND', async () => {
  await expect(new ClearGoal(fakeGoalsRepo()).execute({ goalId: 'goal_999' })).rejects.toThrow(
    DomainError,
  );
});

test('assess-goal-risk flags high risk when discretionary spend exceeds the headroom', async () => {
  const goal: Goal = {
    id: 'goal_001',
    name: 'Auto',
    targetAmount: 1_200_000,
    targetDate: '2026-06-17',
    linkedCategory: null,
    createdAt: '2026-05-01',
  };
  const result = await new AssessGoalRisk(
    fakeGoalsRepo([goal]),
    fakeIncomeRepo({ recurringMonthly: 1_000_000 }),
    fakeTransactionsRepo([tx('txn_001', '2026-05-10', 700_000, 'entretenimiento')]),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
  ).execute();
  expect(result.assessments).toHaveLength(1);
  expect(result.assessments[0].recentDiscretionarySpend).toBe(700_000);
  expect(result.assessments[0].risk).toBe('high');
});
