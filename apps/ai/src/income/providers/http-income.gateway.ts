import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { IncomeGateway } from '../domain/income.gateway';

export function makeHttpIncomeGateway(api: ApiClient): IncomeGateway {
  return makeHttpGateway<IncomeGateway>(api, {
    declareIncome: '/income/declare',
    cashFlow: '/income/cash-flow',
  });
}
