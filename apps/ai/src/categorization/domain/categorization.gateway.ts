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

export const createCategoryInput = z.object({
  name: z.string().min(1).max(24),
  description: z.string().max(240).optional(),
});
export const createCategoryResult = z.object({
  name: z.string(),
  description: z.string(),
});

export const renameCategoryInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1).max(24),
});
export const renameCategoryResult = z.object({ from: z.string(), to: z.string() });

export const deleteCategoryInput = z.object({ name: z.string().min(1) });
export const deleteCategoryResult = z.object({ name: z.string() });

export const listCategoriesInput = z.object({});
export const listCategoriesResult = z.object({
  categories: z.array(z.object({
    name: z.string(),
    isCustom: z.boolean(),
    description: z.string(),
  })),
});

export const proposeCategoryChangeInput = z.object({
  intent: z.enum(['delete', 'rename']),
  name: z.string().min(1),
  newName: z.string().min(1).max(24).optional(),
});
export const proposeCategoryChangeResult = z.object({
  intent: z.enum(['delete', 'rename']),
  name: z.string(),
  newName: z.string().optional(),
  affectedTransactionCount: z.number(),
});

export type CreateCategoryInput = z.infer<typeof createCategoryInput>;
export type CreateCategoryResult = z.infer<typeof createCategoryResult>;
export type RenameCategoryInput = z.infer<typeof renameCategoryInput>;
export type RenameCategoryResult = z.infer<typeof renameCategoryResult>;
export type DeleteCategoryInput = z.infer<typeof deleteCategoryInput>;
export type DeleteCategoryResult = z.infer<typeof deleteCategoryResult>;
export type ListCategoriesInput = z.infer<typeof listCategoriesInput>;
export type ListCategoriesResult = z.infer<typeof listCategoriesResult>;
export type ProposeCategoryChangeInput = z.infer<typeof proposeCategoryChangeInput>;
export type ProposeCategoryChangeResult = z.infer<typeof proposeCategoryChangeResult>;

export const updateCategoryDescriptionInput = z.object({
  name: z.string().min(1),
  description: z.string().max(240),
});
export const updateCategoryDescriptionResult = z.object({
  name: z.string(),
  description: z.string(),
});

export const resetCategoryDescriptionInput = z.object({ name: z.string().min(1) });
export const resetCategoryDescriptionResult = z.object({
  name: z.string(),
  description: z.string(),
});

export type UpdateCategoryDescriptionInput = z.infer<typeof updateCategoryDescriptionInput>;
export type UpdateCategoryDescriptionResult = z.infer<typeof updateCategoryDescriptionResult>;
export type ResetCategoryDescriptionInput = z.infer<typeof resetCategoryDescriptionInput>;
export type ResetCategoryDescriptionResult = z.infer<typeof resetCategoryDescriptionResult>;

export interface CategorizationGateway {
  overrideMerchant(input: OverrideMerchantInput, ctx: GatewayCtx): Promise<OverrideMerchantResult>;
  overrideTransaction(input: OverrideTransactionInput, ctx: GatewayCtx): Promise<OverrideTransactionResult>;
  create(input: CreateCategoryInput, ctx: GatewayCtx): Promise<CreateCategoryResult>;
  rename(input: RenameCategoryInput, ctx: GatewayCtx): Promise<RenameCategoryResult>;
  remove(input: DeleteCategoryInput, ctx: GatewayCtx): Promise<DeleteCategoryResult>;
  list(input: ListCategoriesInput, ctx: GatewayCtx): Promise<ListCategoriesResult>;
  propose(
    input: ProposeCategoryChangeInput,
    ctx: GatewayCtx,
  ): Promise<ProposeCategoryChangeResult>;
  updateDescription(input: UpdateCategoryDescriptionInput, ctx: GatewayCtx): Promise<UpdateCategoryDescriptionResult>;
  resetDescription(input: ResetCategoryDescriptionInput, ctx: GatewayCtx): Promise<ResetCategoryDescriptionResult>;
}
