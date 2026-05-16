import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/income.gateway';
import type { IncomeGateway } from '../domain/income.gateway';

export function makeIncomeTools(gateway: IncomeGateway) {
  return {
    declareIncome: createGatewayTool({
      id: 'declareIncome',
      description: 'Record income — a recurring monthly figure or a one-off entry (ARS).',
      inputSchema: s.declareIncomeInput,
      outputSchema: s.declareIncomeResult,
      call: (i, c) => gateway.declareIncome(i, c),
    }),
    getCashFlow: createGatewayTool({
      id: 'getCashFlow',
      description: 'Net cash flow (income minus expenses) and approximate savings rate for a period.',
      inputSchema: s.cashFlowInput,
      outputSchema: s.cashFlowResult,
      call: (i, c) => gateway.cashFlow(i, c),
    }),
  };
}
