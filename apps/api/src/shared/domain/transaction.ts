import { z } from 'zod';
import { categorySchema } from './category';

export const transactionSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.literal('ARS'),
  category: categorySchema,
  description: z.string(),
  merchant: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;
