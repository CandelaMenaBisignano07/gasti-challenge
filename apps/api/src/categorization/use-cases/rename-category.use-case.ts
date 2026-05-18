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

export interface RenameCategoryInput {
  from: string;
  to: string;
}

export interface RenameCategoryResult {
  from: string;
  to: string;
}

@Injectable()
export class RenameCategory {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    @Inject(CATEGORIZATION_REPOSITORY) private readonly catRepo: CategorizationRepository,
    @Inject(BUDGETS_REPOSITORY) private readonly budgetsRepo: BudgetsRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: RenameCategoryInput): Promise<RenameCategoryResult> {
    const from = normalizeCategoryName(input.from);
    const to = normalizeCategoryName(input.to);
    if (to.length === 0 || to.length > 24) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'El nombre de la categoría debe tener entre 1 y 24 caracteres.',
      );
    }
    if (this.registry.isDefault(from)) {
      throw new DomainError('VALIDATION_ERROR', `"${from}" es una categoría por defecto y no se puede renombrar.`);
    }
    if (!(await this.registry.isCustom(from))) {
      throw new DomainError('NOT_FOUND', `La categoría "${from}" no existe.`);
    }
    if (await this.registry.exists(to)) {
      throw new DomainError('VALIDATION_ERROR', `La categoría "${to}" ya existe.`);
    }
    await this.txRepo.reassignCategory(from, to);
    await this.catRepo.reassignCategory(from, to);
    await this.budgetsRepo.reassignCategory(from, to);
    await this.repo.rename(from, to);
    return { from, to };
  }
}
