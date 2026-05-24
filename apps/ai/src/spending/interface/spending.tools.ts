import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/spending.gateway';
import type { SpendingGateway } from '../domain/spending.gateway';

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralMovements(n: number): string {
  return `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;
}

export function makeSpendingTools(gateway: SpendingGateway) {
  return {
    sumSpendByCategory: createGatewayTool({
      id: 'sumSpendByCategory',
      description: 'Total amount spent in one category over a period (ARS).',
      inputSchema: s.sumByCategoryInput,
      outputSchema: s.sumByCategoryResult,
      call: (i, c) => gateway.sumByCategory(i, c),
      transform: (output) =>
        output.transactionCount === 0
          ? null
          : {
              kind: 'stat',
              label: capitalize(output.category),
              value: output.total,
              caption: pluralMovements(output.transactionCount),
            },
    }),
    getSpendingBreakdown: createGatewayTool({
      id: 'getSpendingBreakdown',
      description: 'Ranked per-category spending breakdown over a period.',
      inputSchema: s.breakdownInput,
      outputSchema: s.breakdownResult,
      call: (i, c) => gateway.breakdown(i, c),
      transform: (output) =>
        output.breakdown.length === 0
          ? null
          : {
              kind: 'rankedList',
              items: output.breakdown.map((b) => ({
                label: capitalize(b.category),
                value: b.total,
                share: b.share,
                icon: b.category,
              })),
            },
    }),
    getTopMerchants: createGatewayTool({
      id: 'getTopMerchants',
      description: 'Merchants ranked by total spend over a period.',
      inputSchema: s.topMerchantsInput,
      outputSchema: s.topMerchantsResult,
      call: (i, c) => gateway.topMerchants(i, c),
      transform: (output) =>
        output.merchants.length === 0
          ? null
          : {
              kind: 'rankedList',
              items: output.merchants.map((m) => ({
                label: m.merchant,
                value: m.total,
                sub: `${m.transactionCount} ${m.transactionCount === 1 ? 'mov.' : 'movs.'}`,
              })),
            },
    }),
    listTransactions: createGatewayTool({
      id: 'listTransactions',
      description:
        'Filtered transaction lookup by merchant, one or more categories, and/or period. Omit categories to include all of them.',
      inputSchema: s.listTransactionsInput,
      outputSchema: s.listTransactionsResult,
      call: (i, c) => gateway.listTransactions(i, c),
      transform: (output) =>
        output.transactions.length === 0
          ? null
          : { kind: 'transactionList', items: output.transactions },
    }),
    compareSpending: createGatewayTool({
      id: 'compareSpending',
      description: 'Compare spending between two periods with per-category deltas.',
      inputSchema: s.compareInput,
      outputSchema: s.compareResult,
      call: (i, c) => gateway.compare(i, c),
      transform: (output) =>
        output.categories.length === 0
          ? null
          : {
              kind: 'compareList',
              periodA: output.labelA,
              periodB: output.labelB,
              rows: output.categories.map((c) => ({
                label: capitalize(c.category),
                a: c.totalA,
                b: c.totalB,
                delta: c.delta,
                deltaPct: c.deltaPct,
              })),
            },
    }),
  };
}
