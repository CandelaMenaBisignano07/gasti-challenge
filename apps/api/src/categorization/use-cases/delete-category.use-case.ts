import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../../shared/domain/category-overrides';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { BUDGETS_REPOSITORY, type BudgetsRepository } from '../../budgets/domain/budgets.repository';
import { normalizeCategoryName } from '../providers/category-name';

const FALLBACK_CATEGORY = 'otros';

export interface DeleteCategoryInput {
  name: string;
}

export interface DeleteCategoryResult {
  name: string;
}

@Injectable()
export class DeleteCategory {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    @Inject(CATEGORIZATION_REPOSITORY) private readonly catRepo: CategorizationRepository,
    @Inject(BUDGETS_REPOSITORY) private readonly budgetsRepo: BudgetsRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: DeleteCategoryInput): Promise<DeleteCategoryResult> {
    const name = normalizeCategoryName(input.name);
    if (this.registry.isDefault(name)) {
      throw new DomainError('VALIDATION_ERROR', `"${name}" es una categoría por defecto y no se puede borrar.`);
    }
    if (!(await this.registry.isCustom(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    await this.txRepo.reassignCategory(name, FALLBACK_CATEGORY);
    await this.catRepo.reassignCategory(name, FALLBACK_CATEGORY);
    await this.budgetsRepo.clearCategory(name);
    await this.repo.remove(name);
    return { name };
  }
}
