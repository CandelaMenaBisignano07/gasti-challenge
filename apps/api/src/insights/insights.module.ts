import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { ProjectMonthEnd } from './use-cases/project-month-end.use-case';
import { DetectRecurringCharges } from './use-cases/recurring-charges.use-case';
import { DetectCategorySpikes } from './use-cases/category-spikes.use-case';
import { InsightsController } from './interface/insights.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [InsightsController],
  providers: [ProjectMonthEnd, DetectRecurringCharges, DetectCategorySpikes],
})
export class InsightsModule {}
