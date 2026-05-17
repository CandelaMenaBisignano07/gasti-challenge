import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BUDGETS_REPOSITORY } from './domain/budgets.repository';
import { JsonBudgetsRepository } from './repositories/json-budgets.repository';
import { SetBudget } from './use-cases/set-budget.use-case';
import { ClearBudget } from './use-cases/clear-budget.use-case';
import { GetBudgetProgress } from './use-cases/budget-progress.use-case';
import { BudgetsController } from './interface/budgets.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [BudgetsController],
  providers: [
    { provide: BUDGETS_REPOSITORY, useClass: JsonBudgetsRepository },
    SetBudget,
    ClearBudget,
    GetBudgetProgress,
  ],
})
export class BudgetsModule {}
