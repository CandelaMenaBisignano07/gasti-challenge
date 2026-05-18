import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { daysInMonth, formatIso, monthKey, startOfMonth } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../domain/budgets.repository';

export interface BudgetProgressInput {
  category?: Category;
}

@Injectable()
export class GetBudgetProgress {
  constructor(
    @Inject(BUDGETS_REPOSITORY) private readonly budgets: BudgetsRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: BudgetProgressInput) {
    const now = this.clock.now();
    const from = startOfMonth(now);
    const today = formatIso(now);
    const daysElapsed = now.getUTCDate();
    const dim = daysInMonth(now);

    const budgets = await this.budgets.forMonth(monthKey(now));
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const spentByCat = new Map<Category, number>();
    for (const t of txs) {
      if (t.date < from || t.date > today) continue;
      const c = cats.get(t.id)!;
      spentByCat.set(c, (spentByCat.get(c) ?? 0) + t.amount);
    }

    let entries = Object.entries(budgets) as [Category, number][];
    if (input.category) entries = entries.filter(([c]) => c === input.category);

    const items = entries.map(([category, budget]) => {
      const spent = spentByCat.get(category) ?? 0;
      const remaining = budget - spent;
      const projected = daysElapsed > 0 ? Math.round((spent / daysElapsed) * dim) : 0;
      const pace: 'under' | 'on' | 'over' =
        projected < budget * 0.95 ? 'under' : projected > budget * 1.05 ? 'over' : 'on';
      return { category, budget, spent, remaining, pace, projected };
    });
    return { items };
  }
}
