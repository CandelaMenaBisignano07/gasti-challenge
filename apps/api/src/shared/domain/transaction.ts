import { z } from 'zod';
import { categorySchema } from './category';
import { operationTypeSchema } from '../../mp/domain/operation-type';

export const transactionDirection = z.enum(['expense', 'income']);
export const transactionStatusSchema = z.enum(['active', 'refunded', 'charged_back', 'canceled']);
export const transactionSource = z.enum(['manual', 'mercadopago']);

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
  statusDetail: z.string().nullable().default(null),
  source: transactionSource.default('manual'),
  mpPaymentId: z.string().nullable().default(null),
  // Human-readable other party in the transaction. For MP income, this is
  // the payer's name (`payerNameOf(payment)`); for MP expenses it's null
  // because `merchant` already conveys it. Null on manual transactions and
  // older rows that pre-date this field.
  counterparty: z.string().nullable().default(null),
  // `needsReview` is set true when a backfilled transaction's classification
  // confidence falls below the LOW_CONFIDENCE threshold. The UI surfaces these
  // for the user to inspect.
  needsReview: z.boolean().default(false),
  // MP's `operation_type` (regular_payment, money_transfer, recurring_payment).
  // `account_fund` is filtered before persistence, so we never store it. Null
  // for manual or older rows that pre-date the polling pivot.
  operationType: operationTypeSchema.nullable().default(null),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionDirection = z.infer<typeof transactionDirection>;
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;
export type TransactionSource = z.infer<typeof transactionSource>;
