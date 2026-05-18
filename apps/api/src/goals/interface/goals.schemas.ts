import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const setGoalInput = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkedCategory: categorySchema.optional(),
});
export const listGoalsInput = z.object({});
export const goalProgressInput = z.object({ goalId: z.string().optional() });
export const clearGoalInput = z.object({ goalId: z.string().min(1) });
export const assessRiskInput = z.object({});
