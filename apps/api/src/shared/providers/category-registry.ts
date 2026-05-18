import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORIES } from '../domain/category';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../domain/custom-categories';

/** Resolves the live set of valid categories: the seven defaults + custom ones. */
@Injectable()
export class CategoryRegistry {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
  ) {}

  /** Defaults first, then custom categories. */
  async all(): Promise<string[]> {
    return [...DEFAULT_CATEGORIES, ...(await this.repo.all())];
  }

  async exists(name: string): Promise<boolean> {
    return (await this.all()).includes(name);
  }

  isDefault(name: string): boolean {
    return (DEFAULT_CATEGORIES as readonly string[]).includes(name);
  }

  async isCustom(name: string): Promise<boolean> {
    return (await this.repo.all()).includes(name);
  }
}
