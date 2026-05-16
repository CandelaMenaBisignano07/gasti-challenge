import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';
import { transactionSchema } from '../../shared/domain/transaction';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const sumByCategoryInput = z.object({ category: categorySchema, period: periodSchema });
export const sumByCategoryResult = z.object({
  category: categorySchema,
  total: z.number(),
  transactionCount: z.number().int(),
});

export const breakdownInput = z.object({ period: periodSchema });
export const breakdownResult = z.object({
  total: z.number(),
  breakdown: z.array(z.object({ category: categorySchema, total: z.number(), share: z.number() })),
});

export const topMerchantsInput = z.object({ period: periodSchema, limit: z.number().int().positive().optional() });
export const topMerchantsResult = z.object({
  merchants: z.array(z.object({ merchant: z.string(), total: z.number(), transactionCount: z.number().int() })),
});

export const listTransactionsInput = z.object({
  merchant: z.string().optional(),
  category: categorySchema.optional(),
  period: periodSchema,
  limit: z.number().int().positive().optional(),
});
export const listTransactionsResult = z.object({
  transactions: z.array(transactionSchema),
  total: z.number(),
});

export const compareInput = z.object({ periodA: periodSchema, periodB: periodSchema });
export const compareResult = z.object({
  totalA: z.number(),
  totalB: z.number(),
  categories: z.array(
    z.object({
      category: categorySchema,
      totalA: z.number(),
      totalB: z.number(),
      delta: z.number(),
      deltaPct: z.number(),
    }),
  ),
});

export type SumByCategoryInput = z.infer<typeof sumByCategoryInput>;
export type SumByCategoryResult = z.infer<typeof sumByCategoryResult>;
export type BreakdownInput = z.infer<typeof breakdownInput>;
export type BreakdownResult = z.infer<typeof breakdownResult>;
export type TopMerchantsInput = z.infer<typeof topMerchantsInput>;
export type TopMerchantsResult = z.infer<typeof topMerchantsResult>;
export type ListTransactionsInput = z.infer<typeof listTransactionsInput>;
export type ListTransactionsResult = z.infer<typeof listTransactionsResult>;
export type CompareInput = z.infer<typeof compareInput>;
export type CompareResult = z.infer<typeof compareResult>;

export interface SpendingGateway {
  sumByCategory(input: SumByCategoryInput, ctx: GatewayCtx): Promise<SumByCategoryResult>;
  breakdown(input: BreakdownInput, ctx: GatewayCtx): Promise<BreakdownResult>;
  topMerchants(input: TopMerchantsInput, ctx: GatewayCtx): Promise<TopMerchantsResult>;
  listTransactions(input: ListTransactionsInput, ctx: GatewayCtx): Promise<ListTransactionsResult>;
  compare(input: CompareInput, ctx: GatewayCtx): Promise<CompareResult>;
}
