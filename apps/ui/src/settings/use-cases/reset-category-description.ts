import { HttpCategoriesSettingsRepository } from '../repositories/http-categories-settings-repository';

export async function resetCategoryDescription(name: string) {
  return new HttpCategoriesSettingsRepository().resetDescription(name);
}
