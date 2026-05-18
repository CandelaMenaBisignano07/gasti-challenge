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
  // Bounded so a runaway LLM description fails structured-output validation
  // instead of leaking an over-long string into the proactive UI cards.
  suggestedDescription: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
});

export type ClassifyMpEventInput = z.infer<typeof classifyMpEventInput>;
export type Classification = z.infer<typeof classificationSchema>;
