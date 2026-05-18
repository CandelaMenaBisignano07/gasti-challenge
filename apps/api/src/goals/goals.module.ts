import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { IncomeModule } from '../income/income.module';
import { GOALS_REPOSITORY } from './domain/goals.repository';
import { JsonGoalsRepository } from './repositories/json-goals.repository';
import { SetGoal } from './use-cases/set-goal.use-case';
import { ListGoals } from './use-cases/list-goals.use-case';
import { ClearGoal } from './use-cases/clear-goal.use-case';
import { GetGoalProgress } from './use-cases/goal-progress.use-case';
import { AssessGoalRisk } from './use-cases/assess-goal-risk.use-case';
import { GoalsController } from './interface/goals.controller';

@Module({
  imports: [TransactionsModule, IncomeModule],
  controllers: [GoalsController],
  providers: [
    { provide: GOALS_REPOSITORY, useClass: JsonGoalsRepository },
    SetGoal,
    ListGoals,
    ClearGoal,
    GetGoalProgress,
    AssessGoalRisk,
  ],
})
export class GoalsModule {}
