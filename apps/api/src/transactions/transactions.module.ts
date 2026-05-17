import { Module } from '@nestjs/common';
import { TRANSACTIONS_REPOSITORY } from './domain/transactions.repository';
import { JsonTransactionsRepository } from './repositories/json-transactions.repository';
import { AddTransaction } from './use-cases/add.use-case';
import { UpdateTransaction } from './use-cases/update.use-case';
import { DeleteTransaction } from './use-cases/delete.use-case';
import { ProposeTransactionMutation } from './use-cases/propose-mutation.use-case';
import { TransactionsController } from './interface/transactions.controller';

@Module({
  controllers: [TransactionsController],
  providers: [
    { provide: TRANSACTIONS_REPOSITORY, useClass: JsonTransactionsRepository },
    AddTransaction,
    UpdateTransaction,
    DeleteTransaction,
    ProposeTransactionMutation,
  ],
  exports: [TRANSACTIONS_REPOSITORY],
})
export class TransactionsModule {}
