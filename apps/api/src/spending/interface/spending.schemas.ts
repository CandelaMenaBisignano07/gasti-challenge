import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';

export const sumByCategoryInput = z.object({ category: categorySchema, period: periodSchema });
export const breakdownInput = z.object({ period: periodSchema });
export const topMerchantsInput = z.object({
  period: periodSchema,
  limit: z.number().int().positive().optional(),
});
export const listTransactionsInput = z.object({
  merchant: z.string().optional(),
  categories: z.array(categorySchema).optional(),
  period: periodSchema,
  limit: z.number().int().positive().optional(),
});
export const compareInput = z.object({ periodA: periodSchema, periodB: periodSchema });
