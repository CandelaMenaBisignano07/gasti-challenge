import { z } from 'zod';
import { periodSchema } from '../../shared/domain/period';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const declareIncomeInput = z.object({
  kind: z.enum(['recurring', 'oneOff']),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});
export const declareIncomeResult = z.object({
  kind: z.enum(['recurring', 'oneOff']),
  amount: z.number(),
  date: z.string().nullable(),
  description: z.string().nullable(),
});

export const cashFlowInput = z.object({ period: periodSchema });
export const cashFlowResult = z.object({
  income: z.number(),
  expenses: z.number(),
  net: z.number(),
  savingsRate: z.number().nullable(),
});

export type DeclareIncomeInput = z.infer<typeof declareIncomeInput>;
export type DeclareIncomeResult = z.infer<typeof declareIncomeResult>;
export type CashFlowInput = z.infer<typeof cashFlowInput>;
export type CashFlowResult = z.infer<typeof cashFlowResult>;

export interface IncomeGateway {
  declareIncome(input: DeclareIncomeInput, ctx: GatewayCtx): Promise<DeclareIncomeResult>;
  cashFlow(input: CashFlowInput, ctx: GatewayCtx): Promise<CashFlowResult>;
}
