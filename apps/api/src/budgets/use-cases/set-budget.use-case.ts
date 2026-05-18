import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { monthKey } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../domain/budgets.repository';

export interface SetBudgetInput {
  category: Category;
  amount: number;
}

@Injectable()
export class SetBudget {
  constructor(
    @Inject(BUDGETS_REPOSITORY) private readonly repo: BudgetsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: SetBudgetInput) {
    if (!(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }
    const month = monthKey(this.clock.now());
    await this.repo.set(month, input.category, input.amount);
    return { category: input.category, amount: input.amount, month };
  }
}
