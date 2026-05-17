import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../../shared/domain/category';
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
  ) {}

  async execute(input: OverrideMerchantInput): Promise<OverrideMerchantInput> {
    await this.repo.setMerchant(input.merchant, input.category);
    return { merchant: input.merchant, category: input.category };
  }
}
