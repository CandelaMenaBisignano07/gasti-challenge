import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { INCOME_REPOSITORY } from './domain/income.repository';
import { JsonIncomeRepository } from './repositories/json-income.repository';
import { DeclareIncome } from './use-cases/declare-income.use-case';
import { GetCashFlow } from './use-cases/cash-flow.use-case';
import { IncomeController } from './interface/income.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [IncomeController],
  providers: [
    { provide: INCOME_REPOSITORY, useClass: JsonIncomeRepository },
    DeclareIncome,
    GetCashFlow,
  ],
  exports: [INCOME_REPOSITORY],
})
export class IncomeModule {}
