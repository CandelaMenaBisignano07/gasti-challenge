import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORIES } from '../domain/category';
import { DomainError } from '../domain/domain-error';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../domain/custom-categories';
import {
  DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
  type DefaultCategoryOverridesRepository,
} from '../domain/default-category-overrides';
import { CategoryRegistry } from './category-registry';

export interface ResolvedCategory {
  readonly name: string;
  readonly description: string;
  readonly isCustom: boolean;
}

/**
 * Effective description for a category: user override > seed (for defaults) /
 * stored description (for customs) > '' (custom with no description).
 */
@Injectable()
export class CategoryDescriptionResolver {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly customs: CategoriesRepository,
    @Inject(DEFAULT_CATEGORY_OVERRIDES_REPOSITORY) private readonly defaults: DefaultCategoryOverridesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async resolve(name: string): Promise<string> {
    if (!(await this.registry.exists(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    if (this.registry.isDefault(name)) {
      const overrides = await this.defaults.all();
      if (name in overrides) return overrides[name];
      return DEFAULT_CATEGORIES.find((c) => c.name === name)!.description;
    }
    const all = await this.customs.all();
    return all.find((c) => c.name === name)?.description ?? '';
  }

  async resolveAll(): Promise<ResolvedCategory[]> {
    const [overrides, customs] = await Promise.all([this.defaults.all(), this.customs.all()]);
    const defaults: ResolvedCategory[] = DEFAULT_CATEGORIES.map((c) => ({
      name: c.name,
      description: overrides[c.name] ?? c.description,
      isCustom: false,
    }));
    const customList: ResolvedCategory[] = customs.map((c) => ({
      name: c.name,
      description: c.description,
      isCustom: true,
    }));
    return [...defaults, ...customList];
  }
}
