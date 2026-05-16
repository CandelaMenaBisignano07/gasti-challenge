import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const setBudgetInput = z.object({ category: categorySchema, amount: z.number().positive() });
export const setBudgetResult = z.object({
  category: categorySchema,
  amount: z.number(),
  month: z.string(),
});

export const clearBudgetInput = z.object({ category: categorySchema });
export const clearBudgetResult = z.object({ category: categorySchema, cleared: z.boolean() });

export const budgetProgressInput = z.object({ category: categorySchema.optional() });
export const budgetProgressResult = z.object({
  items: z.array(
    z.object({
      category: categorySchema,
      budget: z.number(),
      spent: z.number(),
      remaining: z.number(),
      pace: z.enum(['under', 'on', 'over']),
      projected: z.number(),
    }),
  ),
});

export type SetBudgetInput = z.infer<typeof setBudgetInput>;
export type SetBudgetResult = z.infer<typeof setBudgetResult>;
export type ClearBudgetInput = z.infer<typeof clearBudgetInput>;
export type ClearBudgetResult = z.infer<typeof clearBudgetResult>;
export type BudgetProgressInput = z.infer<typeof budgetProgressInput>;
export type BudgetProgressResult = z.infer<typeof budgetProgressResult>;

export interface BudgetsGateway {
  setBudget(input: SetBudgetInput, ctx: GatewayCtx): Promise<SetBudgetResult>;
  clearBudget(input: ClearBudgetInput, ctx: GatewayCtx): Promise<ClearBudgetResult>;
  progress(input: BudgetProgressInput, ctx: GatewayCtx): Promise<BudgetProgressResult>;
}
