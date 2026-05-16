import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/goals.gateway';
import type { GoalsGateway } from '../domain/goals.gateway';

export function makeGoalsTools(gateway: GoalsGateway) {
  return {
    setGoal: createGatewayTool({
      id: 'setGoal',
      description: 'Create or update a named savings goal with a target amount and date.',
      inputSchema: s.setGoalInput,
      outputSchema: s.setGoalResult,
      call: (i, c) => gateway.setGoal(i, c),
    }),
    listGoals: createGatewayTool({
      id: 'listGoals',
      description: 'List all active savings goals.',
      inputSchema: s.listGoalsInput,
      outputSchema: s.listGoalsResult,
      call: (i, c) => gateway.listGoals(i, c),
    }),
    getGoalProgress: createGatewayTool({
      id: 'getGoalProgress',
      description:
        'Progress toward a savings goal: saved so far, remaining, required monthly pace, and whether on track. Omit goalId for all goals.',
      inputSchema: s.goalProgressInput,
      outputSchema: s.goalProgressResult,
      call: (i, c) => gateway.progress(i, c),
    }),
    clearGoal: createGatewayTool({
      id: 'clearGoal',
      description: 'Remove a savings goal.',
      inputSchema: s.clearGoalInput,
      outputSchema: s.clearGoalResult,
      call: (i, c) => gateway.clearGoal(i, c),
    }),
    assessGoalRisk: createGatewayTool({
      id: 'assessGoalRisk',
      description:
        'Assess whether recent discretionary spending threatens the pace of any active savings goal.',
      inputSchema: s.assessGoalRiskInput,
      outputSchema: s.assessGoalRiskResult,
      call: (i, c) => gateway.assessRisk(i, c),
    }),
  };
}
