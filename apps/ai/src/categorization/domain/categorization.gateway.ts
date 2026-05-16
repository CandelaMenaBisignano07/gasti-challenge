import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const overrideMerchantInput = z.object({ merchant: z.string(), category: categorySchema });
export const overrideMerchantResult = z.object({ merchant: z.string(), category: categorySchema });

export const overrideTransactionInput = z.object({ transactionId: z.string(), category: categorySchema });
export const overrideTransactionResult = z.object({ transactionId: z.string(), category: categorySchema });

export type OverrideMerchantInput = z.infer<typeof overrideMerchantInput>;
export type OverrideMerchantResult = z.infer<typeof overrideMerchantResult>;
export type OverrideTransactionInput = z.infer<typeof overrideTransactionInput>;
export type OverrideTransactionResult = z.infer<typeof overrideTransactionResult>;

export interface CategorizationGateway {
  overrideMerchant(input: OverrideMerchantInput, ctx: GatewayCtx): Promise<OverrideMerchantResult>;
  overrideTransaction(input: OverrideTransactionInput, ctx: GatewayCtx): Promise<OverrideTransactionResult>;
}
