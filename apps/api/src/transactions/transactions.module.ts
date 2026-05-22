import { Module } from '@nestjs/common';
import { TRANSACTIONS_REPOSITORY } from './domain/transactions.repository';
import { JsonTransactionsRepository } from './repositories/json-transactions.repository';
import { AddTransaction } from './use-cases/add.use-case';
import { UpdateTransaction } from './use-cases/update.use-case';
import { DeleteTransaction } from './use-cases/delete.use-case';
import { ProposeTransactionMutation } from './use-cases/propose-mutation.use-case';
import { TransactionsController } from './interface/transactions.controller';
import { TRANSACTION_CLASSIFIER } from '../categorization/domain/transaction-classifier';
import { HttpTransactionClassifier } from '../categorization/providers/http-transaction-classifier';
import { CategoryDescriptionResolver } from '../shared/providers/category-description-resolver';
import { DEFAULT_CATEGORY_OVERRIDES_REPOSITORY } from '../shared/domain/default-category-overrides';
import { JsonDefaultCategoryOverridesRepository } from '../categorization/repositories/json-default-category-overrides.repository';

@Module({
  controllers: [TransactionsController],
  providers: [
    { provide: TRANSACTIONS_REPOSITORY, useClass: JsonTransactionsRepository },
    AddTransaction,
    UpdateTransaction,
    DeleteTransaction,
    ProposeTransactionMutation,
    {
      provide: DEFAULT_CATEGORY_OVERRIDES_REPOSITORY,
      useFactory: () => new JsonDefaultCategoryOverridesRepository(),
    },
    CategoryDescriptionResolver,
    { provide: TRANSACTION_CLASSIFIER, useClass: HttpTransactionClassifier },
  ],
  exports: [TRANSACTIONS_REPOSITORY],
})
export class TransactionsModule {}
