import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const classifyTransactionInput = z.object({
  merchant: z.string().min(1),
  description: z.string().nullable(),
  amount: z.number().positive(),
  direction: z.enum(['expense', 'income']).default('expense'),
  /** The user's category set with descriptions — the source of truth for the model. */
  categories: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string(),
      }),
    )
    .min(1),
});

export const classificationResult = z.object({
  category: categorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(160).optional(),
});

export type ClassifyTransactionInput = z.infer<typeof classifyTransactionInput>;
export type ClassificationResult = z.infer<typeof classificationResult>;
