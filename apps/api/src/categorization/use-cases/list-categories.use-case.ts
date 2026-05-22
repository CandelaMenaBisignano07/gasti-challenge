import { Inject, Injectable } from '@nestjs/common';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryDescriptionResolver } from '../../shared/providers/category-description-resolver';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';

export interface CategoryListing {
  name: string;
  isCustom: boolean;
  description: string;
}
export interface ListCategoriesResult {
  categories: CategoryListing[];
}

@Injectable()
export class ListCategories {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    private readonly registry: CategoryRegistry,
    private readonly resolver: CategoryDescriptionResolver,
  ) {}

  async execute(): Promise<ListCategoriesResult> {
    const resolved = await this.resolver.resolveAll();
    return {
      categories: resolved.map((c) => ({ name: c.name, isCustom: c.isCustom, description: c.description })),
    };
  }
}
