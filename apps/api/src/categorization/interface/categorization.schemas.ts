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

export const createCategoryInput = z.object({
  name: z.string().min(1).max(24),
});

export const renameCategoryInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1).max(24),
});

export const deleteCategoryInput = z.object({
  name: z.string().min(1),
});
