import { z } from 'zod';

export const periodSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('currentMonth') })
      .describe('The current calendar month so far, relative to today.'),
    z
      .object({ kind: z.literal('lastNDays'), n: z.number().int().positive() })
      .describe('A rolling window of the last N days ending today.'),
    z
      .object({
        kind: z.literal('month'),
        month: z.string().regex(/^\d{4}-\d{2}$/).describe('Target month, formatted yyyy-MM (e.g. 2026-05).'),
      })
      .describe('One specific calendar month.'),
    z
      .object({
        kind: z.literal('customRange'),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date, ISO yyyy-MM-dd, inclusive.'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date, ISO yyyy-MM-dd, inclusive.'),
      })
      .describe('An explicit date range.'),
  ])
  .describe(
    "A time period. Use kind 'currentMonth' for the current month; 'lastNDays' with n for a rolling window; " +
      "'month' with month 'yyyy-MM' for one specific month; 'customRange' with from/to ISO dates for an explicit range.",
  );

export type Period = z.infer<typeof periodSchema>;
