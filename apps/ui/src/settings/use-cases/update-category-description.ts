import { HttpCategoriesSettingsRepository } from '../repositories/http-categories-settings-repository';

export async function updateCategoryDescription(name: string, description: string) {
  return new HttpCategoriesSettingsRepository().updateDescription(name, description);
}
