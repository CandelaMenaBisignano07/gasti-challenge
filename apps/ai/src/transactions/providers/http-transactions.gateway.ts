import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { TransactionsGateway } from '../domain/transactions.gateway';

export function makeHttpTransactionsGateway(api: ApiClient): TransactionsGateway {
  return makeHttpGateway<TransactionsGateway>(api, {
    proposeMutation: '/transactions/propose-mutation',
    add: '/transactions/add',
    update: '/transactions/update',
    remove: '/transactions/delete',
  });
}
