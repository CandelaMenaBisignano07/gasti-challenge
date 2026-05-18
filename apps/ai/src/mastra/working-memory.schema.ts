import { z } from 'zod';
import { categorySchema } from '../shared/domain/category';

/**
 * Working-memory mirror — the small, always-relevant slice of user state the
 * agent keeps in context for cheap proactivity. The apps/api DB is the source
 * of truth; this mirror is refreshed via Mastra's updateWorkingMemory tool.
 * Categorization overrides are deliberately excluded (they grow unbounded and
 * are resolved server-side). See 2026-05-17-gasti-memory-design.md §4.
 */
export const workingMemorySchema = z.object({
  userProfile: z
    .object({
      displayName: z.string().optional(),
    })
    .optional(),
  budgets: z
    .array(
      z.object({
        category: categorySchema,
        amount: z.number(),
      }),
    )
    .optional(),
  goals: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        targetAmount: z.number(),
        targetDate: z.string(),
      }),
    )
    .optional(),
  income: z
    .object({
      recurringMonthly: z.number().optional(),
    })
    .optional(),
});
