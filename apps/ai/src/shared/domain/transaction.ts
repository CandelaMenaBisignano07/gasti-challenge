import { z } from 'zod';
import { categorySchema } from './category';

export const transactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number(),
  currency: z.literal('ARS'),
  category: categorySchema,
  description: z.string(),
  merchant: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;
