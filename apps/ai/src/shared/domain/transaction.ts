import { z } from 'zod';
import { categorySchema } from './category';

// Mirror of the persisted Transaction shape in apps/api. The fields below
// `merchant` are optional + nullable so older rows missing them still parse,
// and so additions on the api side don't immediately break apps/ai. Zod
// stripping (the default) was hiding rich fields like `counterparty` and
// `direction` from the UI; explicit declaration here surfaces them.
export const transactionSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.literal('ARS'),
  category: categorySchema,
  description: z.string(),
  merchant: z.string(),
  direction: z.enum(['income', 'expense']).optional(),
  status: z.enum(['active', 'refunded', 'charged_back']).optional(),
  source: z.enum(['manual', 'mercadopago']).optional(),
  mpPaymentId: z.string().nullable().optional(),
  needsReview: z.boolean().optional(),
  operationType: z
    .enum(['regular_payment', 'money_transfer', 'recurring_payment'])
    .nullable()
    .optional(),
  counterparty: z.string().nullable().optional(),
});

export type Transaction = z.infer<typeof transactionSchema>;
