import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';

/** Body for POST /proactive/:id/resolve — discriminated on `action`. */
export const resolvePromptBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    overrides: z
      .object({
        category: categorySchema.optional(),
        description: z.string().optional(),
        rememberMerchantCategory: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({ action: z.literal('discard') }),
]);

export type ResolvePromptBody = z.infer<typeof resolvePromptBody>;
