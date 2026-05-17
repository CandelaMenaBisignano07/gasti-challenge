import { Module } from '@nestjs/common';
import { TRANSACTIONS_REPOSITORY } from './domain/transactions.repository';
import { JsonTransactionsRepository } from './repositories/json-transactions.repository';

@Module({
  providers: [{ provide: TRANSACTIONS_REPOSITORY, useClass: JsonTransactionsRepository }],
  exports: [TRANSACTIONS_REPOSITORY],
})
export class TransactionsModule {}
