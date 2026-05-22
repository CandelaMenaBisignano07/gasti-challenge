import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../../shared/domain/custom-categories';
import { normalizeCategoryName } from '../providers/category-name';

const MAX_DESCRIPTION_LENGTH = 240;

export interface CreateCategoryInput {
  name: string;
  description?: string;
}
export interface CreateCategoryResult {
  name: string;
  description: string;
}

@Injectable()
export class CreateCategory {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly repo: CategoriesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: CreateCategoryInput): Promise<CreateCategoryResult> {
    const name = normalizeCategoryName(input.name);
    const description = (input.description ?? '').trim();
    if (name.length === 0 || name.length > 24) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'El nombre de la categoría debe tener entre 1 y 24 caracteres.',
      );
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`,
      );
    }
    if (await this.registry.exists(name)) {
      throw new DomainError('VALIDATION_ERROR', `La categoría "${name}" ya existe.`);
    }
    await this.repo.add(name, description);
    return { name, description };
  }
}
