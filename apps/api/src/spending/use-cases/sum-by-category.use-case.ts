import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface SumByCategoryInput {
  category: Category;
  period: Period;
}

@Injectable()
export class SumByCategory {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: SumByCategoryInput) {
    const range = this.periods.resolve(input.period);
    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    const matching = txs.filter(
      (t) => t.date >= range.from && t.date <= range.to && cats.get(t.id) === input.category,
    );
    return {
      category: input.category,
      total: matching.reduce((s, t) => s + t.amount, 0),
      transactionCount: matching.length,
    };
  }
}
