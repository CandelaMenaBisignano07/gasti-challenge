import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { addDays, formatIso, monthsBetween } from '../../shared/domain/dates';
import { isDiscretionary } from '../../shared/domain/category';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { INCOME_REPOSITORY, type IncomeRepository } from '../../income/domain/income.repository';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

@Injectable()
export class AssessGoalRisk {
  constructor(
    @Inject(GOALS_REPOSITORY) private readonly goalsRepo: GoalsRepository,
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute() {
    const goals = await this.goalsRepo.all();
    const now = this.clock.now();
    const today = formatIso(now);
    const windowStart = addDays(today, -29);

    const stmt = await this.income.get();
    const monthlyIncome = stmt.recurringMonthly ?? 0;
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);

    let recentDiscretionarySpend = 0;
    let recentEssentialSpend = 0;
    const discretionaryTotals = new Map<string, number>();
    for (const t of txs) {
      if (t.date < windowStart || t.date > today) continue;
      const category = cats.get(t.id)!;
      if (isDiscretionary(category)) {
        recentDiscretionarySpend += t.amount;
        discretionaryTotals.set(category, (discretionaryTotals.get(category) ?? 0) + t.amount);
      } else {
        recentEssentialSpend += t.amount;
      }
    }
    const discretionaryByCategory = [...discretionaryTotals.entries()].map(([category, amount]) => ({
      category,
      amount,
    }));

    const assessments = goals.map((goal) => {
      const monthsToDeadline = monthsBetween(today, goal.targetDate);
      const requiredMonthlyPace =
        monthsToDeadline > 0 ? Math.round(goal.targetAmount / monthsToDeadline) : goal.targetAmount;
      const headroom = monthlyIncome - recentEssentialSpend - requiredMonthlyPace;

      let risk: 'none' | 'watch' | 'high';
      if (recentDiscretionarySpend <= Math.max(headroom, 0)) {
        risk = 'none';
      } else if (headroom > 0 && recentDiscretionarySpend <= headroom * 1.5) {
        risk = 'watch';
      } else {
        risk = 'high';
      }

      const overflow = recentDiscretionarySpend - Math.max(headroom, 0);
      const estimatedDelay =
        risk !== 'none' && requiredMonthlyPace > 0
          ? Math.round((overflow / requiredMonthlyPace) * 10) / 10
          : undefined;

      return {
        goalId: goal.id,
        name: goal.name,
        requiredMonthlyPace,
        recentDiscretionarySpend,
        discretionaryByCategory,
        headroom,
        risk,
        ...(estimatedDelay !== undefined ? { estimatedDelay } : {}),
      };
    });
    return { assessments };
  }
}
