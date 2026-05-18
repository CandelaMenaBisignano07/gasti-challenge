import type { Category } from '../../shared/domain/category';

/** The classifier's verdict for a Mercado Pago movement. */
export interface Classification {
  readonly category: Category;
  readonly suggestedDescription: string;
  readonly confidence: number;
}
