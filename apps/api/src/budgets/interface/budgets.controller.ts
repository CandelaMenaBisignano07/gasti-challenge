import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { SetBudget, type SetBudgetInput } from '../use-cases/set-budget.use-case';
import { ClearBudget, type ClearBudgetInput } from '../use-cases/clear-budget.use-case';
import { GetBudgetProgress, type BudgetProgressInput } from '../use-cases/budget-progress.use-case';
import { budgetProgressInput, clearBudgetInput, setBudgetInput } from './budgets.schemas';

@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly setBudget: SetBudget,
    private readonly clearBudget: ClearBudget,
    private readonly progress: GetBudgetProgress,
  ) {}

  @Post('set')
  set(@Body(new ZodValidationPipe(setBudgetInput)) body: SetBudgetInput) {
    return this.setBudget.execute(body);
  }

  @Post('clear')
  clear(@Body(new ZodValidationPipe(clearBudgetInput)) body: ClearBudgetInput) {
    return this.clearBudget.execute(body);
  }

  @Post('progress')
  getProgress(@Body(new ZodValidationPipe(budgetProgressInput)) body: BudgetProgressInput) {
    return this.progress.execute(body);
  }
}
