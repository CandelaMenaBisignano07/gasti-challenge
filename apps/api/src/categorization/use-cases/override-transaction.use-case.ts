import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../../shared/domain/category';
import { DomainError } from '../../shared/domain/domain-error';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../../shared/domain/category-overrides';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';

export interface OverrideTransactionInput {
  transactionId: string;
  category: Category;
}

@Injectable()
export class OverrideTransactionCategory {
  constructor(
    @Inject(CATEGORIZATION_REPOSITORY) private readonly repo: CategorizationRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
  ) {}

  async execute(input: OverrideTransactionInput): Promise<OverrideTransactionInput> {
    const exists = (await this.txRepo.all()).some((t) => t.id === input.transactionId);
    if (!exists) {
      throw new DomainError('NOT_FOUND', `Transacción ${input.transactionId} no encontrada.`);
    }
    await this.repo.setTransaction(input.transactionId, input.category);
    return { transactionId: input.transactionId, category: input.category };
  }
}
