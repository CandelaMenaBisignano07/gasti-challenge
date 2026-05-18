import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface BreakdownInput {
  period: Period;
}

@Injectable()
export class GetSpendingBreakdown {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: BreakdownInput) {
    const range = this.periods.resolve(input.period);
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const totals = new Map<Category, number>();
    for (const t of txs) {
      if (t.date < range.from || t.date > range.to) continue;
      const c = cats.get(t.id)!;
      totals.set(c, (totals.get(c) ?? 0) + t.amount);
    }
    const total = [...totals.values()].reduce((s, v) => s + v, 0);
    const breakdown = [...totals.entries()]
      .map(([category, catTotal]) => ({
        category,
        total: catTotal,
        share: total > 0 ? catTotal / total : 0,
      }))
      .sort((a, b) => b.total - a.total);
    return { total, breakdown };
  }
}
