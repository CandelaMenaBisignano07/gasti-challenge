import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/budgets.gateway';
import type { BudgetsGateway } from '../domain/budgets.gateway';

export function makeBudgetsTools(gateway: BudgetsGateway) {
  return {
    setBudget: createGatewayTool({
      id: 'setBudget',
      description: 'Set or update the monthly budget for a category (ARS).',
      inputSchema: s.setBudgetInput,
      outputSchema: s.setBudgetResult,
      call: (i, c) => gateway.setBudget(i, c),
    }),
    clearBudget: createGatewayTool({
      id: 'clearBudget',
      description: 'Remove the monthly budget for a category.',
      inputSchema: s.clearBudgetInput,
      outputSchema: s.clearBudgetResult,
      call: (i, c) => gateway.clearBudget(i, c),
    }),
    getBudgetProgress: createGatewayTool({
      id: 'getBudgetProgress',
      description: 'Current spend versus budget and on-track-at-pace status. Omit category for all budgets.',
      inputSchema: s.budgetProgressInput,
      outputSchema: s.budgetProgressResult,
      call: (i, c) => gateway.progress(i, c),
      transform: (output) => ({ kind: 'budgetProgress', progress: output.items[0] ?? null }),
    }),
  };
}
