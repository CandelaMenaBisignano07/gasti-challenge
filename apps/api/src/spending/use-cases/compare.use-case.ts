import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { DateRange, Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface CompareInput {
  periodA: Period;
  periodB: Period;
}

@Injectable()
export class CompareSpending {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: CompareInput) {
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const sumByCat = (range: DateRange): Map<Category, number> => {
      const m = new Map<Category, number>();
      for (const t of txs) {
        if (t.date < range.from || t.date > range.to) continue;
        const c = cats.get(t.id)!;
        m.set(c, (m.get(c) ?? 0) + t.amount);
      }
      return m;
    };
    const a = sumByCat(this.periods.resolve(input.periodA));
    const b = sumByCat(this.periods.resolve(input.periodB));
    const categories = [...new Set<Category>([...a.keys(), ...b.keys()])]
      .map((category) => {
        const totalA = a.get(category) ?? 0;
        const totalB = b.get(category) ?? 0;
        const delta = totalB - totalA;
        const deltaPct = totalA > 0 ? (delta / totalA) * 100 : totalB > 0 ? 100 : 0;
        return { category, totalA, totalB, delta, deltaPct };
      })
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    return {
      totalA: [...a.values()].reduce((s, v) => s + v, 0),
      totalB: [...b.values()].reduce((s, v) => s + v, 0),
      categories,
    };
  }
}
