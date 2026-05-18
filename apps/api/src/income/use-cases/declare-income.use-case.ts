import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { formatIso } from '../../shared/domain/dates';
import { INCOME_REPOSITORY, type IncomeRepository } from '../domain/income.repository';

export interface DeclareIncomeInput {
  kind: 'recurring' | 'oneOff';
  amount: number;
  date?: string;
  description?: string;
}

@Injectable()
export class DeclareIncome {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly repo: IncomeRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: DeclareIncomeInput) {
    if (input.kind === 'recurring') {
      await this.repo.setRecurring(input.amount);
      return { kind: 'recurring' as const, amount: input.amount };
    }
    const entry = {
      amount: input.amount,
      date: input.date ?? formatIso(this.clock.now()),
      description: input.description ?? '',
    };
    await this.repo.addOneOff(entry);
    return { kind: 'oneOff' as const, ...entry };
  }
}
