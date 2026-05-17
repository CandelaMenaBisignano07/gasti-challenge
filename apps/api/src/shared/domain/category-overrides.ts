import type { Category } from './category';

export const CATEGORIZATION_REPOSITORY = 'CATEGORIZATION_REPOSITORY';

export interface CategoryOverrides {
  merchants: Record<string, Category>;
  transactions: Record<string, Category>;
}

export interface CategorizationRepository {
  overrides(): Promise<CategoryOverrides>;
  setMerchant(merchant: string, category: Category): Promise<void>;
  setTransaction(transactionId: string, category: Category): Promise<void>;
}

export const EMPTY_OVERRIDES: CategoryOverrides = { merchants: {}, transactions: {} };
