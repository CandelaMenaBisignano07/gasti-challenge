import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { InsightsGateway } from '../domain/insights.gateway';

export function makeHttpInsightsGateway(api: ApiClient): InsightsGateway {
  return makeHttpGateway<InsightsGateway>(api, {
    projectMonthEnd: '/insights/project-month-end',
    recurringCharges: '/insights/recurring-charges',
    categorySpikes: '/insights/category-spikes',
  });
}
