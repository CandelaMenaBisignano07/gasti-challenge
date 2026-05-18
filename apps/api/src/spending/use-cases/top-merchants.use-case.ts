import { Inject, Injectable } from '@nestjs/common';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface TopMerchantsInput {
  period: Period;
  limit?: number;
}

@Injectable()
export class GetTopMerchants {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
  ) {}

  async execute(input: TopMerchantsInput) {
    const range = this.periods.resolve(input.period);
    const txs = (await this.txRepo.all()).filter(
      (t) => t.date >= range.from && t.date <= range.to,
    );
    const byMerchant = new Map<string, { total: number; count: number }>();
    for (const t of txs) {
      const e = byMerchant.get(t.merchant) ?? { total: 0, count: 0 };
      e.total += t.amount;
      e.count += 1;
      byMerchant.set(t.merchant, e);
    }
    const merchants = [...byMerchant.entries()]
      .map(([merchant, e]) => ({ merchant, total: e.total, transactionCount: e.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, input.limit ?? 10);
    return { merchants };
  }
}
