import type { Category } from '../../shared/domain/category';

export const TRANSACTION_CLASSIFIER = 'TRANSACTION_CLASSIFIER';

export interface ClassifyArgs {
  readonly merchant: string;
  readonly description: string | null;
  readonly amount: number;
  readonly direction: 'expense' | 'income';
}

export interface Classification {
  readonly category: Category;
  readonly confidence: number;
  readonly reasoning?: string;
}

/** Classifies a single transaction into a category + confidence using the user's category descriptions. */
export interface TransactionClassifier {
  classify(args: ClassifyArgs): Promise<Classification>;
}

/** Used when the classifier is unreachable or returns an invalid response. */
export const FALLBACK_CLASSIFICATION: Classification = {
  category: 'otros',
  confidence: 0,
};
