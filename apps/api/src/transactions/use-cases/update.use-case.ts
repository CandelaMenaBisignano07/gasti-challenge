import { Inject, Injectable } from '@nestjs/common';
import { CategoryRegistry } from '../../shared/providers/category-registry';
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
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: UpdateTransactionInput): Promise<{ transaction: Transaction }> {
    if (input.fields.category && !(await this.registry.exists(input.fields.category))) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `"${input.fields.category}" no es una categoría válida.`,
      );
    }
    const tx = await this.repo.update(input.transactionId, input.fields);
    if (!tx) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    return { transaction: tx };
  }
}
