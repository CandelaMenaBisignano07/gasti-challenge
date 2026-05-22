import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { OverrideMerchantCategory } from './use-cases/override-merchant.use-case';
import { OverrideTransactionCategory } from './use-cases/override-transaction.use-case';
import { CreateCategory } from './use-cases/create-category.use-case';
import { RenameCategory } from './use-cases/rename-category.use-case';
import { DeleteCategory } from './use-cases/delete-category.use-case';
import { ListCategories } from './use-cases/list-categories.use-case';
import { UpdateCategoryDescription } from './use-cases/update-category-description.use-case';
import { ResetCategoryDescription } from './use-cases/reset-category-description.use-case';
import { ProposeCategoryChange } from './use-cases/propose-category-change.use-case';
import { CategorizationController } from './interface/categorization.controller';
import { JsonDefaultCategoryOverridesRepository } from './repositories/json-default-category-overrides.repository';
import { DEFAULT_CATEGORY_OVERRIDES_REPOSITORY } from '../shared/domain/default-category-overrides';
import { CategoryDescriptionResolver } from '../shared/providers/category-description-resolver';

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
    UpdateCategoryDescription,
    ResetCategoryDescription,
    ProposeCategoryChange,
    CategoryDescriptionResolver,
    {
      provide: DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
      useFactory: () => new JsonDefaultCategoryOverridesRepository(),
    },
  ],
  exports: [CategoryDescriptionResolver, DEFAULT_CATEGORY_OVERRIDES_REPOSITORY],
})
export class CategorizationModule {}
