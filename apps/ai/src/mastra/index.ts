import { Mastra } from '@mastra/core';
import { makeApiClient } from '../shared/providers/api-client';
import { makeHttpSpendingGateway } from '../spending/providers/http-spending.gateway';
import { makeHttpInsightsGateway } from '../insights/providers/http-insights.gateway';
import { makeHttpBudgetsGateway } from '../budgets/providers/http-budgets.gateway';
import { makeHttpIncomeGateway } from '../income/providers/http-income.gateway';
import { makeHttpCategorizationGateway } from '../categorization/providers/http-categorization.gateway';
import { makeHttpTransactionsGateway } from '../transactions/providers/http-transactions.gateway';
import { makeHttpGoalsGateway } from '../goals/providers/http-goals.gateway';
import { makeSpendingTools } from '../spending/interface/spending.tools';
import { makeInsightsTools } from '../insights/interface/insights.tools';
import { makeBudgetsTools } from '../budgets/interface/budgets.tools';
import { makeIncomeTools } from '../income/interface/income.tools';
import { makeCategorizationTools } from '../categorization/interface/categorization.tools';
import { makeTransactionsTools } from '../transactions/interface/transactions.tools';
import { makeGoalsTools } from '../goals/interface/goals.tools';
import { makeGastiAgent } from '../agent/gasti-agent';
import { buildMastraStorage } from './storage';
import { buildGastiMemory } from './memory';
import { DEFAULT_CATEGORIES } from '../shared/domain/category';

const api = makeApiClient();

const categorizationGateway = makeHttpCategorizationGateway(api);

const tools = {
  ...makeSpendingTools(makeHttpSpendingGateway(api)),
  ...makeInsightsTools(makeHttpInsightsGateway(api)),
  ...makeBudgetsTools(makeHttpBudgetsGateway(api)),
  ...makeIncomeTools(makeHttpIncomeGateway(api)),
  ...makeCategorizationTools(categorizationGateway),
  ...makeTransactionsTools(makeHttpTransactionsGateway(api)),
  ...makeGoalsTools(makeHttpGoalsGateway(api)),
};

const gasti = makeGastiAgent({ tools, memory: buildGastiMemory() });

export const mastra = new Mastra({
  agents: { gasti },
  storage: buildMastraStorage(),
  server: {
    middleware: [
      async (context, next) => {
        const requestContext = context.get('requestContext');
        requestContext.set('today', new Date().toISOString().slice(0, 10));
        requestContext.set('userId', 'default-user');
        try {
          const { categories } = await categorizationGateway.list({}, { userId: 'default-user' });
          requestContext.set(
            'categories',
            categories.map((c) => c.name),
          );
        } catch {
          requestContext.set('categories', [...DEFAULT_CATEGORIES]);
        }
        await next();
      },
    ],
  },
});
