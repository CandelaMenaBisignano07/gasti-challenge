import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../../shared/domain/category';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../../shared/domain/category-overrides';

export interface OverrideMerchantInput {
  merchant: string;
  category: Category;
}

@Injectable()
export class OverrideMerchantCategory {
  constructor(
    @Inject(CATEGORIZATION_REPOSITORY) private readonly repo: CategorizationRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: OverrideMerchantInput): Promise<OverrideMerchantInput> {
    if (!(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }
    await this.repo.setMerchant(input.merchant, input.category);
    return { merchant: input.merchant, category: input.category };
  }
}
