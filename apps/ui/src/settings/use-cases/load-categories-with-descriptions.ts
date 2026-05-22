import type { CategoryWithDescription } from '../domain/category-with-description';
import { HttpCategoriesSettingsRepository } from '../repositories/http-categories-settings-repository';

export async function loadCategoriesWithDescriptions(): Promise<CategoryWithDescription[]> {
  return new HttpCategoriesSettingsRepository().list();
}
