import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { CategorizationGateway } from '../domain/categorization.gateway';

export function makeHttpCategorizationGateway(api: ApiClient): CategorizationGateway {
  return makeHttpGateway<CategorizationGateway>(api, {
    overrideMerchant: '/categorization/merchant',
    overrideTransaction: '/categorization/transaction',
    create: '/categorization/create-category',
    rename: '/categorization/rename-category',
    remove: '/categorization/delete-category',
    list: '/categorization/list-categories',
    propose: '/categorization/propose-category-change',
  });
}
