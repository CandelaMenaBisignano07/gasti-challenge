import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORY_NAMES } from '../domain/category';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../domain/custom-categories';

@Injectable()
export class CategoryRegistry {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
  ) {}

  async all(): Promise<string[]> {
    const customs = await this.repo.all();
    return [...DEFAULT_CATEGORY_NAMES, ...customs.map((c) => c.name)];
  }

  async exists(name: string): Promise<boolean> {
    return (await this.all()).includes(name);
  }

  isDefault(name: string): boolean {
    return DEFAULT_CATEGORY_NAMES.includes(name);
  }

  async isCustom(name: string): Promise<boolean> {
    const customs = await this.repo.all();
    return customs.some((c) => c.name === name);
  }
}
