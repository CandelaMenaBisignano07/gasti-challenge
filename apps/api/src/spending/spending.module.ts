import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { SumByCategory } from './use-cases/sum-by-category.use-case';
import { GetSpendingBreakdown } from './use-cases/breakdown.use-case';
import { GetTopMerchants } from './use-cases/top-merchants.use-case';
import { ListTransactions } from './use-cases/list-transactions.use-case';
import { CompareSpending } from './use-cases/compare.use-case';
import { SpendingController } from './interface/spending.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [SpendingController],
  providers: [SumByCategory, GetSpendingBreakdown, GetTopMerchants, ListTransactions, CompareSpending],
})
export class SpendingModule {}
