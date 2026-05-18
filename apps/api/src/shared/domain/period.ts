import { z } from 'zod';

export const periodSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('currentMonth') }),
  z.object({ kind: z.literal('lastNDays'), n: z.number().int().positive() }),
  z.object({ kind: z.literal('month'), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({
    kind: z.literal('customRange'),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

export type Period = z.infer<typeof periodSchema>;

export interface DateRange {
  from: string;
  to: string;
}
