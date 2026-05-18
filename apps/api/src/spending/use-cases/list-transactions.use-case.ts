import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface ListTransactionsInput {
  merchant?: string;
  categories?: Category[];
  period: Period;
  limit?: number;
}

@Injectable()
export class ListTransactions {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: ListTransactionsInput): Promise<{ transactions: Transaction[]; total: number }> {
    const range = this.periods.resolve(input.period);
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    let matches = txs.filter((t) => t.date >= range.from && t.date <= range.to);
    if (input.merchant) {
      const needle = input.merchant.toLowerCase();
      matches = matches.filter((t) => t.merchant.toLowerCase().includes(needle));
    }
    if (input.categories && input.categories.length > 0) {
      const wanted = new Set(input.categories);
      matches = matches.filter((t) => wanted.has(cats.get(t.id)!));
    }
    matches.sort((a, b) => b.date.localeCompare(a.date));
    const total = matches.reduce((s, t) => s + t.amount, 0);
    const limited = input.limit ? matches.slice(0, input.limit) : matches;
    const transactions = limited.map((t) => ({ ...t, category: cats.get(t.id)! }));
    return { transactions, total };
  }
}
