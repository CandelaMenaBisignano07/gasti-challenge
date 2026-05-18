import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { addMonths, formatIso, startOfMonth } from '../../shared/domain/dates';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface RecurringChargesInput {
  lookbackMonths?: number;
}

@Injectable()
export class DetectRecurringCharges {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RecurringChargesInput) {
    const lookback = input.lookbackMonths ?? 3;
    const now = this.clock.now();
    const from = startOfMonth(addMonths(now, -(lookback - 1)));
    const to = formatIso(now);

    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const windowed = txs.filter((t) => t.date >= from && t.date <= to);

    const byMerchant = new Map<string, Transaction[]>();
    for (const t of windowed) {
      const list = byMerchant.get(t.merchant) ?? [];
      list.push(t);
      byMerchant.set(t.merchant, list);
    }

    const recurring = [];
    for (const [merchant, list] of byMerchant) {
      const months = new Set(list.map((t) => t.date.slice(0, 7)));
      if (months.size < 2) continue;
      const avg = list.reduce((s, t) => s + t.amount, 0) / list.length;
      if (!list.every((t) => Math.abs(t.amount - avg) <= avg * 0.15)) continue;
      recurring.push({
        merchant,
        category: cats.get(list[0].id)!,
        typicalAmount: Math.round(avg),
        cadence: 'monthly',
        occurrences: list.length,
        lastSeen: list.reduce((m, t) => (t.date > m ? t.date : m), list[0].date),
      });
    }
    recurring.sort((a, b) => b.typicalAmount - a.typicalAmount);
    return { recurring };
  }
}
