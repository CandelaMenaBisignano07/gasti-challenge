import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const overrideMerchantInput = z.object({
  merchant: z.string().min(1),
  category: categorySchema,
});

export const overrideTransactionInput = z.object({
  transactionId: z.string().min(1),
  category: categorySchema,
});
