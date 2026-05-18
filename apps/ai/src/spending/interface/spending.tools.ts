import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/spending.gateway';
import type { SpendingGateway } from '../domain/spending.gateway';

export function makeSpendingTools(gateway: SpendingGateway) {
  return {
    sumSpendByCategory: createGatewayTool({
      id: 'sumSpendByCategory',
      description: 'Total amount spent in one category over a period (ARS).',
      inputSchema: s.sumByCategoryInput,
      outputSchema: s.sumByCategoryResult,
      call: (i, c) => gateway.sumByCategory(i, c),
    }),
    getSpendingBreakdown: createGatewayTool({
      id: 'getSpendingBreakdown',
      description: 'Ranked per-category spending breakdown over a period.',
      inputSchema: s.breakdownInput,
      outputSchema: s.breakdownResult,
      call: (i, c) => gateway.breakdown(i, c),
    }),
    getTopMerchants: createGatewayTool({
      id: 'getTopMerchants',
      description: 'Merchants ranked by total spend over a period.',
      inputSchema: s.topMerchantsInput,
      outputSchema: s.topMerchantsResult,
      call: (i, c) => gateway.topMerchants(i, c),
    }),
    listTransactions: createGatewayTool({
      id: 'listTransactions',
      description:
        'Filtered transaction lookup by merchant, one or more categories, and/or period. Omit categories to include all of them.',
      inputSchema: s.listTransactionsInput,
      outputSchema: s.listTransactionsResult,
      call: (i, c) => gateway.listTransactions(i, c),
      transform: (output) => ({ kind: 'transactionList', items: output.transactions }),
    }),
    compareSpending: createGatewayTool({
      id: 'compareSpending',
      description: 'Compare spending between two periods with per-category deltas.',
      inputSchema: s.compareInput,
      outputSchema: s.compareResult,
      call: (i, c) => gateway.compare(i, c),
    }),
  };
}
