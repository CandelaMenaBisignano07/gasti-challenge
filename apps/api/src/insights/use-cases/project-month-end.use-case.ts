import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { daysInMonth, formatIso, startOfMonth } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface ProjectMonthEndInput {
  category?: Category;
}

@Injectable()
export class ProjectMonthEnd {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ProjectMonthEndInput) {
    const now = this.clock.now();
    const from = startOfMonth(now);
    const today = formatIso(now);
    const daysElapsed = now.getUTCDate();
    const total = daysInMonth(now);

    const txs = await this.txRepo.all();
    const cats = await this.categories.resolveAll(txs);
    let inRange = txs.filter((t) => t.date >= from && t.date <= today);
    if (input.category) {
      inRange = inRange.filter((t) => cats.get(t.id) === input.category);
    }
    const spentSoFar = inRange.reduce((s, t) => s + t.amount, 0);
    const projectedTotal = daysElapsed > 0 ? Math.round((spentSoFar / daysElapsed) * total) : 0;
    const caveat =
      daysElapsed < 5 || inRange.length < 5
        ? 'Proyección con muestra chica; tomala como referencia, no como número firme.'
        : null;

    return { daysElapsed, daysInMonth: total, spentSoFar, projectedTotal, caveat };
  }
}
