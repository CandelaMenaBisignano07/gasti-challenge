import type { User } from '../../users/domain/user';
import type { Classification } from './classification';

export const PAYMENT_CLASSIFIER = 'PAYMENT_CLASSIFIER';

export interface ClassifyArgs {
  readonly user: User;
  readonly kind: 'income' | 'expense';
  readonly amount: number;
  readonly merchant: string | null;
  readonly description: string | null;
  readonly counterparty: string | null;
}

/** Classifies a Mercado Pago movement into a category + description. */
export interface PaymentClassifier {
  classify(args: ClassifyArgs): Promise<Classification>;
}

/** Used when the classifier is unreachable or returns an invalid response. */
export const FALLBACK_CLASSIFICATION = (merchant: string | null): Classification => ({
  category: 'otros',
  suggestedDescription: merchant ?? 'Movimiento de Mercado Pago',
  confidence: 0,
});
