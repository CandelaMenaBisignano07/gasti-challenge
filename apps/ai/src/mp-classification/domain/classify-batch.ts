import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { classifyMpEventInput } from './classification';

export const classifyBatchInput = z.object({
  payments: z.array(classifyMpEventInput).min(1),
  /**
   * Future-proofing hook for per-user categories (spec §10b). When omitted, the
   * agent uses its hardcoded category set.
   */
  categories: z
    .array(z.object({ name: categorySchema, description: z.string() }))
    .optional(),
});

export const classifyBatchOutput = z.object({
  classifications: z.array(
    z.object({
      category: categorySchema,
      suggestedDescription: z.string().min(1).max(80),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type ClassifyBatchInput = z.infer<typeof classifyBatchInput>;
export type ClassifyBatchOutput = z.infer<typeof classifyBatchOutput>;
