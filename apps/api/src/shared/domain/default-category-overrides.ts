export const DEFAULT_CATEGORY_OVERRIDES_REPOSITORY = 'DEFAULT_CATEGORY_OVERRIDES_REPOSITORY';

/**
 * User-supplied descriptions for the seven default categories. Only names
 * present here have an override; absent names fall back to the seed.
 *
 * The default category NAMES themselves are immutable — this map keys on the
 * default name and only the description can be customised.
 */
export type DefaultCategoryOverrides = Record<string, string>;

export interface DefaultCategoryOverridesRepository {
  all(): Promise<DefaultCategoryOverrides>;
  set(name: string, description: string): Promise<void>;
  /** Idempotent: removing a key that is not present is a no-op. */
  reset(name: string): Promise<void>;
}
