import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { AddTransaction, type AddTransactionInput } from '../use-cases/add.use-case';
import { UpdateTransaction, type UpdateTransactionInput } from '../use-cases/update.use-case';
import { DeleteTransaction, type DeleteTransactionInput } from '../use-cases/delete.use-case';
import {
  ProposeTransactionMutation,
  type ProposeMutationInput,
} from '../use-cases/propose-mutation.use-case';
import {
  addTransactionInput,
  deleteTransactionInput,
  proposeMutationInput,
  updateTransactionInput,
} from './transactions.schemas';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly propose: ProposeTransactionMutation,
    private readonly add: AddTransaction,
    private readonly update: UpdateTransaction,
    private readonly del: DeleteTransaction,
  ) {}

  @Post('propose-mutation')
  proposeMutation(@Body(new ZodValidationPipe(proposeMutationInput)) body: ProposeMutationInput) {
    return this.propose.execute(body);
  }

  @Post('add')
  addTransaction(@Body(new ZodValidationPipe(addTransactionInput)) body: AddTransactionInput) {
    return this.add.execute(body);
  }

  @Post('update')
  updateTransaction(@Body(new ZodValidationPipe(updateTransactionInput)) body: UpdateTransactionInput) {
    return this.update.execute(body);
  }

  @Post('delete')
  deleteTransaction(@Body(new ZodValidationPipe(deleteTransactionInput)) body: DeleteTransactionInput) {
    return this.del.execute(body);
  }
}
