import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { DomainError } from '../../shared/domain/domain-error';
import { addMonths, formatIso, monthsBetween } from '../../shared/domain/dates';
import type { Goal } from '../../shared/domain/goal';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { INCOME_REPOSITORY, type IncomeRepository } from '../../income/domain/income.repository';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

export interface GoalProgressInput {
  goalId?: string;
}

@Injectable()
export class GetGoalProgress {
  constructor(
    @Inject(GOALS_REPOSITORY) private readonly goalsRepo: GoalsRepository,
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: GoalProgressInput) {
    const goals = input.goalId ? [await this.requireGoal(input.goalId)] : await this.goalsRepo.all();
    const now = this.clock.now();
    const today = formatIso(now);
    const stmt = await this.income.get();
    const hasIncome = stmt.recurringMonthly != null || stmt.oneOffs.length > 0;
    const txs = await this.txRepo.all();

    const items = goals.map((goal) => {
      const monthsElapsed = monthsBetween(goal.createdAt, today);
      let savedSoFar: number | null = null;
      if (hasIncome) {
        const income =
          (stmt.recurringMonthly ?? 0) * monthsElapsed +
          stmt.oneOffs
            .filter((o) => o.date >= goal.createdAt && o.date <= today)
            .reduce((s, o) => s + o.amount, 0);
        const expenses = txs
          .filter((t) => t.date >= goal.createdAt && t.date <= today)
          .reduce((s, t) => s + t.amount, 0);
        savedSoFar = Math.round(income - expenses);
      }
      const remaining = goal.targetAmount - (savedSoFar ?? 0);
      const monthsToDeadline = monthsBetween(today, goal.targetDate);
      const requiredMonthlyPace =
        monthsToDeadline > 0 ? Math.round(remaining / monthsToDeadline) : remaining;
      const monthlyRate = savedSoFar != null && monthsElapsed > 0 ? savedSoFar / monthsElapsed : 0;
      const projectedCompletionDate =
        monthlyRate > 0 ? formatIso(addMonths(now, Math.ceil(remaining / monthlyRate))) : null;
      const onTrack = projectedCompletionDate != null && projectedCompletionDate <= goal.targetDate;
      return {
        goalId: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
        savedSoFar,
        remaining,
        requiredMonthlyPace,
        projectedCompletionDate,
        onTrack,
      };
    });
    return { items };
  }

  private async requireGoal(id: string): Promise<Goal> {
    const goal = await this.goalsRepo.getById(id);
    if (!goal) throw new DomainError('NOT_FOUND', `Objetivo ${id} no encontrado.`);
    return goal;
  }
}
