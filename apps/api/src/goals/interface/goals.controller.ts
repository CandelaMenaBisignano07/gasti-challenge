import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { SetGoal, type SetGoalInput } from '../use-cases/set-goal.use-case';
import { ListGoals } from '../use-cases/list-goals.use-case';
import { ClearGoal, type ClearGoalInput } from '../use-cases/clear-goal.use-case';
import { GetGoalProgress, type GoalProgressInput } from '../use-cases/goal-progress.use-case';
import { AssessGoalRisk } from '../use-cases/assess-goal-risk.use-case';
import {
  assessRiskInput,
  clearGoalInput,
  goalProgressInput,
  listGoalsInput,
  setGoalInput,
} from './goals.schemas';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly setGoal: SetGoal,
    private readonly listGoals: ListGoals,
    private readonly progress: GetGoalProgress,
    private readonly clearGoal: ClearGoal,
    private readonly assessRisk: AssessGoalRisk,
  ) {}

  @Post('set')
  set(@Body(new ZodValidationPipe(setGoalInput)) body: SetGoalInput) {
    return this.setGoal.execute(body);
  }

  @Post('list')
  list(@Body(new ZodValidationPipe(listGoalsInput)) _body: Record<string, never>) {
    return this.listGoals.execute();
  }

  @Post('progress')
  getProgress(@Body(new ZodValidationPipe(goalProgressInput)) body: GoalProgressInput) {
    return this.progress.execute(body);
  }

  @Post('clear')
  clear(@Body(new ZodValidationPipe(clearGoalInput)) body: ClearGoalInput) {
    return this.clearGoal.execute(body);
  }

  @Post('assess-risk')
  assess(@Body(new ZodValidationPipe(assessRiskInput)) _body: Record<string, never>) {
    return this.assessRisk.execute();
  }
}
