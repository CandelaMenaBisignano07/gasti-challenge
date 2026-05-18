import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { SharedModule } from './shared/shared.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategorizationModule } from './categorization/categorization.module';
import { SpendingModule } from './spending/spending.module';
import { InsightsModule } from './insights/insights.module';
import { BudgetsModule } from './budgets/budgets.module';
import { IncomeModule } from './income/income.module';
import { GoalsModule } from './goals/goals.module';
import { UsersModule } from './users/users.module';
import { MpModule } from './mp/mp.module';
import { ProactiveModule } from './proactive/proactive.module';

@Module({
  imports: [
    SharedModule,
    TransactionsModule,
    CategorizationModule,
    SpendingModule,
    InsightsModule,
    BudgetsModule,
    IncomeModule,
    GoalsModule,
    UsersModule,
    MpModule,
    ProactiveModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
