import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

export const projectMonthEndInput = z.object({ category: categorySchema.optional() });
export const recurringChargesInput = z.object({
  lookbackMonths: z.number().int().positive().optional(),
});
export const categorySpikesInput = z.object({});
