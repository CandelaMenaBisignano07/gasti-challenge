import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import {
  DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
  type DefaultCategoryOverridesRepository,
} from '../../shared/domain/default-category-overrides';
import { normalizeCategoryName } from '../providers/category-name';

const MAX_DESCRIPTION_LENGTH = 240;

export interface UpdateCategoryDescriptionInput {
  name: string;
  description: string;
}
export interface UpdateCategoryDescriptionResult {
  name: string;
  description: string;
}

@Injectable()
export class UpdateCategoryDescription {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly customs: CategoriesRepository,
    @Inject(DEFAULT_CATEGORY_OVERRIDES_REPOSITORY) private readonly defaults: DefaultCategoryOverridesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: UpdateCategoryDescriptionInput): Promise<UpdateCategoryDescriptionResult> {
    const name = normalizeCategoryName(input.name);
    const description = input.description.trim();
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`,
      );
    }
    if (!(await this.registry.exists(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }
    if (this.registry.isDefault(name)) {
      await this.defaults.set(name, description);
    } else {
      await this.customs.setDescription(name, description);
    }
    return { name, description };
  }
}
