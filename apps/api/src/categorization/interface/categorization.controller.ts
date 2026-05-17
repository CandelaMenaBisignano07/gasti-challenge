import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import {
  OverrideMerchantCategory,
  type OverrideMerchantInput,
} from '../use-cases/override-merchant.use-case';
import {
  OverrideTransactionCategory,
  type OverrideTransactionInput,
} from '../use-cases/override-transaction.use-case';
import { overrideMerchantInput, overrideTransactionInput } from './categorization.schemas';

@Controller('categorization')
export class CategorizationController {
  constructor(
    private readonly merchant: OverrideMerchantCategory,
    private readonly transaction: OverrideTransactionCategory,
  ) {}

  @Post('merchant')
  overrideMerchant(@Body(new ZodValidationPipe(overrideMerchantInput)) body: OverrideMerchantInput) {
    return this.merchant.execute(body);
  }

  @Post('transaction')
  overrideTransaction(
    @Body(new ZodValidationPipe(overrideTransactionInput)) body: OverrideTransactionInput,
  ) {
    return this.transaction.execute(body);
  }
}
