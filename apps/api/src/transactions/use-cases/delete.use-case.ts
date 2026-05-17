import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from '../domain/transactions.repository';

export interface DeleteTransactionInput {
  transactionId: string;
}

@Injectable()
export class DeleteTransaction {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
  ) {}

  async execute(input: DeleteTransactionInput): Promise<{ deletedId: string }> {
    const ok = await this.repo.delete(input.transactionId);
    if (!ok) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    return { deletedId: input.transactionId };
  }
}
