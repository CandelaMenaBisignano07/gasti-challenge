import { z } from 'zod';
import { categorySchema } from './category';

export const transactionDirection = z.enum(['expense', 'income']);
export const transactionStatusSchema = z.enum(['active', 'refunded', 'charged_back']);
export const transactionSource = z.enum(['manual', 'mp_webhook']);

export const transactionSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.literal('ARS'),
  category: categorySchema,
  description: z.string(),
  merchant: z.string(),
  classificationConfidence: z.number().min(0).max(1).optional(),
  classificationSource: z.enum(['manual', 'override', 'classifier', 'fallback']).optional(),
  userId: z.string().default('default-user'),
  direction: transactionDirection.default('expense'),
  status: transactionStatusSchema.default('active'),
  statusChangedAt: z.string().nullable().default(null),
  source: transactionSource.default('manual'),
  mpPaymentId: z.string().nullable().default(null),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionDirection = z.infer<typeof transactionDirection>;
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;
export type TransactionSource = z.infer<typeof transactionSource>;
