import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const projectMonthEndInput = z.object({ category: categorySchema.optional() });
export const projectMonthEndResult = z.object({
  daysElapsed: z.number().int(),
  daysInMonth: z.number().int(),
  spentSoFar: z.number(),
  projectedTotal: z.number(),
  caveat: z.string().nullable(),
});

export const recurringChargesInput = z.object({ lookbackMonths: z.number().int().positive().optional() });
export const recurringChargesResult = z.object({
  recurring: z.array(
    z.object({
      merchant: z.string(),
      category: categorySchema,
      typicalAmount: z.number(),
      cadence: z.string(),
      occurrences: z.number().int(),
      lastSeen: z.string(),
    }),
  ),
});

export const categorySpikesInput = z.object({});
export const categorySpikesResult = z.object({
  spikes: z.array(
    z.object({
      category: categorySchema,
      currentTotal: z.number(),
      priorTotal: z.number(),
      delta: z.number(),
      deltaPct: z.number(),
    }),
  ),
});

export type ProjectMonthEndInput = z.infer<typeof projectMonthEndInput>;
export type ProjectMonthEndResult = z.infer<typeof projectMonthEndResult>;
export type RecurringChargesInput = z.infer<typeof recurringChargesInput>;
export type RecurringChargesResult = z.infer<typeof recurringChargesResult>;
export type CategorySpikesInput = z.infer<typeof categorySpikesInput>;
export type CategorySpikesResult = z.infer<typeof categorySpikesResult>;

export interface InsightsGateway {
  projectMonthEnd(input: ProjectMonthEndInput, ctx: GatewayCtx): Promise<ProjectMonthEndResult>;
  recurringCharges(input: RecurringChargesInput, ctx: GatewayCtx): Promise<RecurringChargesResult>;
  categorySpikes(input: CategorySpikesInput, ctx: GatewayCtx): Promise<CategorySpikesResult>;
}
