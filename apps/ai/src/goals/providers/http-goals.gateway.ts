import { makeHttpGateway } from '../../shared/providers/make-http-gateway';
import type { ApiClient } from '../../shared/providers/api-client';
import type { GoalsGateway } from '../domain/goals.gateway';

export function makeHttpGoalsGateway(api: ApiClient): GoalsGateway {
  return makeHttpGateway<GoalsGateway>(api, {
    setGoal: '/goals/set',
    listGoals: '/goals/list',
    progress: '/goals/progress',
    clearGoal: '/goals/clear',
    assessRisk: '/goals/assess-risk',
  });
}
