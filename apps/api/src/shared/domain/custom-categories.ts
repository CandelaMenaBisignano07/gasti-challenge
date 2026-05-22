export const CATEGORIES_REPOSITORY = 'CATEGORIES_REPOSITORY';

/** A user-created category with its semantic description. */
export interface CustomCategoryDefinition {
  readonly name: string;
  readonly description: string;
}

/** The user-created categories. The seven defaults are NOT stored here. */
export type CustomCategories = CustomCategoryDefinition[];

export const EMPTY_CUSTOM_CATEGORIES: CustomCategories = [];

export interface CategoriesRepository {
  all(): Promise<CustomCategories>;
  /** Idempotent: if a category with `name` already exists, do nothing. */
  add(name: string, description: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Preserves the description while renaming. */
  rename(from: string, to: string): Promise<void>;
  /** Idempotent: if the category does not exist, this is a no-op. */
  setDescription(name: string, description: string): Promise<void>;
}
