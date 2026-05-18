import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/categorization.gateway';
import type { CategorizationGateway } from '../domain/categorization.gateway';

export function makeCategorizationTools(gateway: CategorizationGateway) {
  return {
    overrideMerchantCategory: createGatewayTool({
      id: 'overrideMerchantCategory',
      description: 'Set a per-merchant category rule that future aggregations honor.',
      inputSchema: s.overrideMerchantInput,
      outputSchema: s.overrideMerchantResult,
      call: (i, c) => gateway.overrideMerchant(i, c),
    }),
    overrideTransactionCategory: createGatewayTool({
      id: 'overrideTransactionCategory',
      description: "Override one transaction's category without changing the merchant's default.",
      inputSchema: s.overrideTransactionInput,
      outputSchema: s.overrideTransactionResult,
      call: (i, c) => gateway.overrideTransaction(i, c),
    }),
    createCategory: createGatewayTool({
      id: 'createCategory',
      description:
        'Create a new custom spending category. Non-destructive — no confirmation needed.',
      inputSchema: s.createCategoryInput,
      outputSchema: s.createCategoryResult,
      call: (i, c) => gateway.create(i, c),
    }),
    renameCategory: createGatewayTool({
      id: 'renameCategory',
      description:
        'Rename a custom category. Confirmation-gated: only call after proposeCategoryChange and an explicit user confirmation. Existing transactions, overrides and budgets follow the rename. The seven default categories cannot be renamed.',
      inputSchema: s.renameCategoryInput,
      outputSchema: s.renameCategoryResult,
      call: (i, c) => gateway.rename(i, c),
    }),
    deleteCategory: createGatewayTool({
      id: 'deleteCategory',
      description:
        'Delete a custom category. Confirmation-gated: only call after proposeCategoryChange and an explicit user confirmation. Everything assigned to it falls back to "otros". The seven default categories cannot be deleted.',
      inputSchema: s.deleteCategoryInput,
      outputSchema: s.deleteCategoryResult,
      call: (i, c) => gateway.remove(i, c),
    }),
    listCategories: createGatewayTool({
      id: 'listCategories',
      description: 'List every spending category — the seven defaults and any custom ones.',
      inputSchema: s.listCategoriesInput,
      outputSchema: s.listCategoriesResult,
      call: (i, c) => gateway.list(i, c),
    }),
    proposeCategoryChange: createGatewayTool({
      id: 'proposeCategoryChange',
      description:
        'Read-only. MANDATORY first step for every custom-category delete or rename request — call it each time, even if you already know the affected-transaction count from earlier in the conversation. It renders the confirmation card the user acts on; skip it and there is no card. Returns the affected-transaction count. Never ask for delete/rename confirmation in plain text instead of calling this.',
      inputSchema: s.proposeCategoryChangeInput,
      outputSchema: s.proposeCategoryChangeResult,
      call: (i, c) => gateway.propose(i, c),
    }),
  };
}
