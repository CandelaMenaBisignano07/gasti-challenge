import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const addTransactionInput = z.object({
  date: isoDate.optional(),
  amount: z.number().positive(),
  category: categorySchema.optional(),
  description: z.string().min(1),
  merchant: z.string().min(1),
});

export const transactionFieldsSchema = z
  .object({
    date: isoDate.optional(),
    amount: z.number().positive().optional(),
    category: categorySchema.optional(),
    description: z.string().min(1).optional(),
    merchant: z.string().min(1).optional(),
  })
  .refine((f) => Object.keys(f).length > 0, { message: 'at least one field is required' });

export const updateTransactionInput = z.object({
  transactionId: z.string().min(1),
  fields: transactionFieldsSchema,
});

export const deleteTransactionInput = z.object({
  transactionId: z.string().min(1),
});

export const proposeMutationInput = z.object({
  intent: z.enum(['delete', 'update']),
  selector: z.object({
    transactionId: z.string().optional(),
    merchant: z.string().optional(),
    category: categorySchema.optional(),
    period: periodSchema.optional(),
  }),
  proposedFields: transactionFieldsSchema.optional(),
});
