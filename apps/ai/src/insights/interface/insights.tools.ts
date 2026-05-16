import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/insights.gateway';
import type { InsightsGateway } from '../domain/insights.gateway';

export function makeInsightsTools(gateway: InsightsGateway) {
  return {
    projectMonthEnd: createGatewayTool({
      id: 'projectMonthEnd',
      description: 'Project where the current month ends from partial data; includes a caveat when the sample is thin.',
      inputSchema: s.projectMonthEndInput,
      outputSchema: s.projectMonthEndResult,
      call: (i, c) => gateway.projectMonthEnd(i, c),
    }),
    detectRecurringCharges: createGatewayTool({
      id: 'detectRecurringCharges',
      description: 'Detect recurring, subscription-like charges across recent months.',
      inputSchema: s.recurringChargesInput,
      outputSchema: s.recurringChargesResult,
      call: (i, c) => gateway.recurringCharges(i, c),
    }),
    detectCategorySpikes: createGatewayTool({
      id: 'detectCategorySpikes',
      description: 'Detect categories that jumped sharply versus the prior month.',
      inputSchema: s.categorySpikesInput,
      outputSchema: s.categorySpikesResult,
      call: (i, c) => gateway.categorySpikes(i, c),
    }),
  };
}
