import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { periodSchema } from '../../shared/domain/period';
import { transactionSchema } from '../../shared/domain/transaction';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

const proposedFields = z.object({
  amount: z.number().positive().optional(),
  category: categorySchema.optional(),
  description: z.string().optional(),
  merchant: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const proposeMutationInput = z.object({
  intent: z.enum(['delete', 'update']),
  selector: z.object({
    transactionId: z.string().optional(),
    merchant: z.string().optional(),
    period: periodSchema.optional(),
    description: z.string().optional(),
  }),
  proposedFields: proposedFields.optional(),
});
export const proposeMutationResult = z.object({
  intent: z.enum(['delete', 'update']),
  matches: z.array(transactionSchema),
  proposedFields: proposedFields.optional(),
});

export const addTransactionInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().positive(),
  category: categorySchema.optional(),
  description: z.string(),
  merchant: z.string(),
});
export const addTransactionResult = z.object({ transaction: transactionSchema });

export const updateTransactionInput = z.object({
  transactionId: z.string(),
  fields: proposedFields,
});
export const updateTransactionResult = z.object({ transaction: transactionSchema });

export const deleteTransactionInput = z.object({ transactionId: z.string() });
export const deleteTransactionResult = z.object({ deletedId: z.string() });

export type ProposeMutationInput = z.infer<typeof proposeMutationInput>;
export type ProposeMutationResult = z.infer<typeof proposeMutationResult>;
export type AddTransactionInput = z.infer<typeof addTransactionInput>;
export type AddTransactionResult = z.infer<typeof addTransactionResult>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
export type UpdateTransactionResult = z.infer<typeof updateTransactionResult>;
export type DeleteTransactionInput = z.infer<typeof deleteTransactionInput>;
export type DeleteTransactionResult = z.infer<typeof deleteTransactionResult>;

export interface TransactionsGateway {
  proposeMutation(input: ProposeMutationInput, ctx: GatewayCtx): Promise<ProposeMutationResult>;
  add(input: AddTransactionInput, ctx: GatewayCtx): Promise<AddTransactionResult>;
  update(input: UpdateTransactionInput, ctx: GatewayCtx): Promise<UpdateTransactionResult>;
  remove(input: DeleteTransactionInput, ctx: GatewayCtx): Promise<DeleteTransactionResult>;
}
