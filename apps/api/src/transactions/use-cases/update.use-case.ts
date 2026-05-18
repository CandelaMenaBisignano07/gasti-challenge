import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionFields,
  type TransactionsRepository,
} from '../domain/transactions.repository';

export interface UpdateTransactionInput {
  transactionId: string;
  fields: TransactionFields;
}

@Injectable()
export class UpdateTransaction {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
  ) {}

  async execute(input: UpdateTransactionInput): Promise<{ transaction: Transaction }> {
    const tx = await this.repo.update(input.transactionId, input.fields);
    if (!tx) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    return { transaction: tx };
  }
}
