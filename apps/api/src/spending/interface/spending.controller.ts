import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { SumByCategory, type SumByCategoryInput } from '../use-cases/sum-by-category.use-case';
import { GetSpendingBreakdown, type BreakdownInput } from '../use-cases/breakdown.use-case';
import { GetTopMerchants, type TopMerchantsInput } from '../use-cases/top-merchants.use-case';
import { ListTransactions, type ListTransactionsInput } from '../use-cases/list-transactions.use-case';
import { CompareSpending, type CompareInput } from '../use-cases/compare.use-case';
import {
  breakdownInput,
  compareInput,
  listTransactionsInput,
  sumByCategoryInput,
  topMerchantsInput,
} from './spending.schemas';

@Controller('spending')
export class SpendingController {
  constructor(
    private readonly sum: SumByCategory,
    private readonly breakdown: GetSpendingBreakdown,
    private readonly topMerchants: GetTopMerchants,
    private readonly list: ListTransactions,
    private readonly compare: CompareSpending,
  ) {}

  @Post('sum-by-category')
  sumByCategory(@Body(new ZodValidationPipe(sumByCategoryInput)) body: SumByCategoryInput) {
    return this.sum.execute(body);
  }

  @Post('breakdown')
  getBreakdown(@Body(new ZodValidationPipe(breakdownInput)) body: BreakdownInput) {
    return this.breakdown.execute(body);
  }

  @Post('top-merchants')
  getTopMerchants(@Body(new ZodValidationPipe(topMerchantsInput)) body: TopMerchantsInput) {
    return this.topMerchants.execute(body);
  }

  @Post('list-transactions')
  listTransactions(@Body(new ZodValidationPipe(listTransactionsInput)) body: ListTransactionsInput) {
    return this.list.execute(body);
  }

  @Post('compare')
  compareSpending(@Body(new ZodValidationPipe(compareInput)) body: CompareInput) {
    return this.compare.execute(body);
  }
}
