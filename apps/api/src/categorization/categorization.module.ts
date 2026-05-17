import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { OverrideMerchantCategory } from './use-cases/override-merchant.use-case';
import { OverrideTransactionCategory } from './use-cases/override-transaction.use-case';
import { CategorizationController } from './interface/categorization.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [CategorizationController],
  providers: [OverrideMerchantCategory, OverrideTransactionCategory],
})
export class CategorizationModule {}
