export const CATEGORIES_REPOSITORY = 'CATEGORIES_REPOSITORY';

/** The user-created category slugs. The seven defaults are NOT stored here. */
export type CustomCategories = string[];

export const EMPTY_CUSTOM_CATEGORIES: CustomCategories = [];

export interface CategoriesRepository {
  all(): Promise<CustomCategories>;
  add(name: string): Promise<void>;
  remove(name: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}
