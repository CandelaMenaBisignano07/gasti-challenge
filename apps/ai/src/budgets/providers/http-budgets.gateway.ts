import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { BudgetsGateway } from '../domain/budgets.gateway';

export function makeHttpBudgetsGateway(api: ApiClient): BudgetsGateway {
  return makeHttpGateway<BudgetsGateway>(api, {
    setBudget: '/budgets/set',
    clearBudget: '/budgets/clear',
    progress: '/budgets/progress',
  });
}
