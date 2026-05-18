import { Inject, Injectable } from '@nestjs/common';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { daysBetween } from '../../shared/domain/dates';
import type { Period } from '../../shared/domain/period';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { INCOME_REPOSITORY, type IncomeRepository } from '../domain/income.repository';

export interface CashFlowInput {
  period: Period;
}

@Injectable()
export class GetCashFlow {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly periods: PeriodResolver,
  ) {}

  async execute(input: CashFlowInput) {
    const range = this.periods.resolve(input.period);
    const periodDays = daysBetween(range.from, range.to) + 1;

    const stmt = await this.income.get();
    // A month-scoped period (currentMonth — even partway through — or a specific
    // month) earns one full month of recurring income. Rolling and custom windows
    // are prorated by their day length.
    const monthScoped = input.period.kind === 'currentMonth' || input.period.kind === 'month';
    const recurringMonthly = stmt.recurringMonthly ?? 0;
    const recurring = monthScoped ? recurringMonthly : (recurringMonthly * periodDays) / 30;
    const oneOffs = stmt.oneOffs
      .filter((o) => o.date >= range.from && o.date <= range.to)
      .reduce((s, o) => s + o.amount, 0);
    const income = Math.round(recurring + oneOffs);

    const expenses = (await this.txRepo.all())
      .filter((t) => t.date >= range.from && t.date <= range.to)
      .reduce((s, t) => s + t.amount, 0);

    const net = income - expenses;
    const savingsRate = income > 0 ? net / income : null;
    return { income, expenses, net, savingsRate };
  }
}
