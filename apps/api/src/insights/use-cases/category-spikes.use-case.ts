import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { addMonths, calendarMonthRange, monthKey } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type { DateRange } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

@Injectable()
export class DetectCategorySpikes {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute() {
    const now = this.clock.now();
    const current = calendarMonthRange(monthKey(now));
    const prior = calendarMonthRange(monthKey(addMonths(now, -1)));

    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const sum = (range: DateRange): Map<Category, number> => {
      const m = new Map<Category, number>();
      for (const t of txs) {
        if (t.date < range.from || t.date > range.to) continue;
        const c = cats.get(t.id)!;
        m.set(c, (m.get(c) ?? 0) + t.amount);
      }
      return m;
    };
    const cur = sum(current);
    const pri = sum(prior);

    const spikes = [];
    for (const [category, currentTotal] of cur) {
      const priorTotal = pri.get(category) ?? 0;
      const delta = currentTotal - priorTotal;
      const deltaPct = priorTotal > 0 ? (delta / priorTotal) * 100 : 100;
      if (deltaPct >= 40 && delta >= 10000) {
        spikes.push({ category, currentTotal, priorTotal, delta, deltaPct });
      }
    }
    spikes.sort((a, b) => b.delta - a.delta);
    return { spikes };
  }
}
