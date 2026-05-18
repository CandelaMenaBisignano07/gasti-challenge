import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const classifyMpEventInput = z.object({
  kind: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  counterparty: z.string().nullable(),
});

export const classificationSchema = z.object({
  category: categorySchema,
  suggestedDescription: z.string(),
  confidence: z.number().min(0).max(1),
});

export type ClassifyMpEventInput = z.infer<typeof classifyMpEventInput>;
export type Classification = z.infer<typeof classificationSchema>;
