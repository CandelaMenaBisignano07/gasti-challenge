import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { SpendingGateway } from '../domain/spending.gateway';

export function makeHttpSpendingGateway(api: ApiClient): SpendingGateway {
  return makeHttpGateway<SpendingGateway>(api, {
    sumByCategory: '/spending/sum-by-category',
    breakdown: '/spending/breakdown',
    topMerchants: '/spending/top-merchants',
    listTransactions: '/spending/list-transactions',
    compare: '/spending/compare',
  });
}
