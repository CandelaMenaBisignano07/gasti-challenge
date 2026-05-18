import { Inject, Injectable } from '@nestjs/common';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';

export interface CategoryListing {
  name: string;
  isCustom: boolean;
}

export interface ListCategoriesResult {
  categories: CategoryListing[];
}

@Injectable()
export class ListCategories {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(): Promise<ListCategoriesResult> {
    const custom = new Set(await this.repo.all());
    const all = await this.registry.all();
    return { categories: all.map((name) => ({ name, isCustom: custom.has(name) })) };
  }
}
