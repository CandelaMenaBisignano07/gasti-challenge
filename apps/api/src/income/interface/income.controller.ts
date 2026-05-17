import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { DeclareIncome, type DeclareIncomeInput } from '../use-cases/declare-income.use-case';
import { GetCashFlow, type CashFlowInput } from '../use-cases/cash-flow.use-case';
import { cashFlowInput, declareIncomeInput } from './income.schemas';

@Controller('income')
export class IncomeController {
  constructor(
    private readonly declare: DeclareIncome,
    private readonly cashFlow: GetCashFlow,
  ) {}

  @Post('declare')
  declareIncome(@Body(new ZodValidationPipe(declareIncomeInput)) body: DeclareIncomeInput) {
    return this.declare.execute(body);
  }

  @Post('cash-flow')
  getCashFlow(@Body(new ZodValidationPipe(cashFlowInput)) body: CashFlowInput) {
    return this.cashFlow.execute(body);
  }
}
