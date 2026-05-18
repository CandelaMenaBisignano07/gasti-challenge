import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { monthKey } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../domain/budgets.repository';

export interface ClearBudgetInput {
  category: Category;
}

@Injectable()
export class ClearBudget {
  constructor(
    @Inject(BUDGETS_REPOSITORY) private readonly repo: BudgetsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ClearBudgetInput) {
    await this.repo.clear(monthKey(this.clock.now()), input.category);
    return { category: input.category, cleared: true };
  }
}
