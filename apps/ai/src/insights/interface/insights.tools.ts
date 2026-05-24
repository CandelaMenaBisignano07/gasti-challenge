import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/insights.gateway';
import type { InsightsGateway } from '../domain/insights.gateway';

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function makeInsightsTools(gateway: InsightsGateway) {
  return {
    projectMonthEnd: createGatewayTool({
      id: 'projectMonthEnd',
      description:
        'Project where the current month ends from partial data; includes a caveat when the sample is thin.',
      inputSchema: s.projectMonthEndInput,
      outputSchema: s.projectMonthEndResult,
      call: (i, c) => gateway.projectMonthEnd(i, c),
      transform: (output) => ({
        kind: 'stat',
        label: 'Proyección de fin de mes',
        value: output.projectedTotal,
        caption: output.caveat ?? `Día ${output.daysElapsed} de ${output.daysInMonth}`,
        tone: 'neutral',
      }),
    }),
    detectRecurringCharges: createGatewayTool({
      id: 'detectRecurringCharges',
      description: 'Detect recurring, subscription-like charges across recent months.',
      inputSchema: s.recurringChargesInput,
      outputSchema: s.recurringChargesResult,
      call: (i, c) => gateway.recurringCharges(i, c),
      transform: (output) =>
        output.recurring.length === 0
          ? null
          : {
              kind: 'bulletList',
              items: output.recurring.map((r) => ({
                label: r.merchant,
                sub: `${capitalize(r.cadence)} · ${r.occurrences} cargo${r.occurrences === 1 ? '' : 's'}`,
                value: r.typicalAmount,
                icon: r.category,
              })),
            },
    }),
    detectCategorySpikes: createGatewayTool({
      id: 'detectCategorySpikes',
      description: 'Detect categories that jumped sharply versus the prior month.',
      inputSchema: s.categorySpikesInput,
      outputSchema: s.categorySpikesResult,
      call: (i, c) => gateway.categorySpikes(i, c),
      transform: (output) =>
        output.spikes.length === 0
          ? null
          : {
              kind: 'compareList',
              periodA: 'Mes anterior',
              periodB: 'Este mes',
              rows: output.spikes.map((sp) => ({
                label: capitalize(sp.category),
                a: sp.priorTotal,
                b: sp.currentTotal,
                delta: sp.delta,
                deltaPct: sp.deltaPct,
              })),
            },
    }),
  };
}
