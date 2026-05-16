import { z } from 'zod';
import { categorySchema } from './category';

export const goalSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetAmount: z.number().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkedCategory: categorySchema.nullable(),
});

export type Goal = z.infer<typeof goalSchema>;
