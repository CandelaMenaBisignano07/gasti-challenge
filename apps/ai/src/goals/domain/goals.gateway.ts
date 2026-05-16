import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { goalSchema } from '../../shared/domain/goal';
import type { GatewayCtx } from '../../shared/domain/gateway-ctx';

export const setGoalInput = z.object({
  name: z.string(),
  targetAmount: z.number().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkedCategory: categorySchema.optional(),
});
export const setGoalResult = z.object({ goal: goalSchema });

export const listGoalsInput = z.object({});
export const listGoalsResult = z.object({ goals: z.array(goalSchema) });

export const goalProgressInput = z.object({ goalId: z.string().optional() });
export const goalProgressResult = z.object({
  items: z.array(
    z.object({
      goalId: z.string(),
      name: z.string(),
      targetAmount: z.number(),
      targetDate: z.string(),
      savedSoFar: z.number().nullable(),
      remaining: z.number().nullable(),
      requiredMonthlyPace: z.number().nullable(),
      projectedCompletionDate: z.string().nullable(),
      onTrack: z.boolean().nullable(),
    }),
  ),
});

export const clearGoalInput = z.object({ goalId: z.string() });
export const clearGoalResult = z.object({ goalId: z.string(), cleared: z.boolean() });

export const assessGoalRiskInput = z.object({});
export const assessGoalRiskResult = z.object({
  assessments: z.array(
    z.object({
      goalId: z.string(),
      name: z.string(),
      requiredMonthlyPace: z.number().nullable(),
      recentDiscretionarySpend: z.number(),
      discretionaryByCategory: z.array(z.object({ category: categorySchema, total: z.number() })),
      headroom: z.number().nullable(),
      risk: z.enum(['none', 'watch', 'high']),
      estimatedDelay: z.string().nullable(),
    }),
  ),
});

export type SetGoalInput = z.infer<typeof setGoalInput>;
export type SetGoalResult = z.infer<typeof setGoalResult>;
export type ListGoalsInput = z.infer<typeof listGoalsInput>;
export type ListGoalsResult = z.infer<typeof listGoalsResult>;
export type GoalProgressInput = z.infer<typeof goalProgressInput>;
export type GoalProgressResult = z.infer<typeof goalProgressResult>;
export type ClearGoalInput = z.infer<typeof clearGoalInput>;
export type ClearGoalResult = z.infer<typeof clearGoalResult>;
export type AssessGoalRiskInput = z.infer<typeof assessGoalRiskInput>;
export type AssessGoalRiskResult = z.infer<typeof assessGoalRiskResult>;

export interface GoalsGateway {
  setGoal(input: SetGoalInput, ctx: GatewayCtx): Promise<SetGoalResult>;
  listGoals(input: ListGoalsInput, ctx: GatewayCtx): Promise<ListGoalsResult>;
  progress(input: GoalProgressInput, ctx: GatewayCtx): Promise<GoalProgressResult>;
  clearGoal(input: ClearGoalInput, ctx: GatewayCtx): Promise<ClearGoalResult>;
  assessRisk(input: AssessGoalRiskInput, ctx: GatewayCtx): Promise<AssessGoalRiskResult>;
}
