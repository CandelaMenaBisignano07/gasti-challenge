import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { OverrideMerchantCategory } from './use-cases/override-merchant.use-case';
import { OverrideTransactionCategory } from './use-cases/override-transaction.use-case';
import { CreateCategory } from './use-cases/create-category.use-case';
import { RenameCategory } from './use-cases/rename-category.use-case';
import { DeleteCategory } from './use-cases/delete-category.use-case';
import { ListCategories } from './use-cases/list-categories.use-case';
import { CategorizationController } from './interface/categorization.controller';

@Module({
  imports: [TransactionsModule, BudgetsModule],
  controllers: [CategorizationController],
  providers: [
    OverrideMerchantCategory,
    OverrideTransactionCategory,
    CreateCategory,
    RenameCategory,
    DeleteCategory,
    ListCategories,
  ],
})
export class CategorizationModule {}
