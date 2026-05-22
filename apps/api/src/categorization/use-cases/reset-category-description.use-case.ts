import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DEFAULT_CATEGORIES } from '../../shared/domain/category';
import {
  DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
  type DefaultCategoryOverridesRepository,
} from '../../shared/domain/default-category-overrides';
import { normalizeCategoryName } from '../providers/category-name';

export interface ResetCategoryDescriptionInput { name: string; }
export interface ResetCategoryDescriptionResult { name: string; description: string; }

@Injectable()
export class ResetCategoryDescription {
  constructor(
    @Inject(DEFAULT_CATEGORY_OVERRIDES_REPOSITORY) private readonly defaults: DefaultCategoryOverridesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: ResetCategoryDescriptionInput): Promise<ResetCategoryDescriptionResult> {
    const name = normalizeCategoryName(input.name);
    if (!(await this.registry.exists(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    if (!this.registry.isDefault(name)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Solo las categorías default pueden volver al texto original. Para limpiar una custom, usá updateCategoryDescription con descripción vacía.',
      );
    }
    await this.defaults.reset(name);
    const seed = DEFAULT_CATEGORIES.find((c) => c.name === name)!.description;
    return { name, description: seed };
  }
}
