import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const setBudgetInput = z.object({
  category: categorySchema,
  amount: z.number().positive(),
});
export const clearBudgetInput = z.object({ category: categorySchema });
export const budgetProgressInput = z.object({ category: categorySchema.optional() });
