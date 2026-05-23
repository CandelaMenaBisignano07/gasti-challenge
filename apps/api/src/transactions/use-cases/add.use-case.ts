import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { formatIso } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type {
  Transaction,
  TransactionDirection,
  TransactionSource,
} from '../../shared/domain/transaction';
import {
  TRANSACTION_CLASSIFIER,
  type TransactionClassifier,
} from '../../categorization/domain/transaction-classifier';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from '../domain/transactions.repository';

export interface AddTransactionInput {
  date?: string;
  amount: number;
  category?: Category;
  description: string;
  merchant: string;
  userId?: string;
  direction?: TransactionDirection;
  source?: TransactionSource;
  mpPaymentId?: string | null;
  counterparty?: string | null;
}

@Injectable()
export class AddTransaction {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly registry: CategoryRegistry,
    @Inject(TRANSACTION_CLASSIFIER) private readonly classifier: TransactionClassifier,
  ) {}

  async execute(input: AddTransactionInput): Promise<{ transaction: Transaction }> {
    if (input.category && !(await this.registry.exists(input.category))) {
      throw new DomainError('VALIDATION_ERROR', `"${input.category}" no es una categoría válida.`);
    }

    let category: Category;
    let classificationConfidence: number | undefined;
    let classificationSource: Transaction['classificationSource'];

    if (input.category) {
      category = input.category;
      classificationSource = 'manual';
    } else {
      const override = await this.categories.categoryForMerchant(input.merchant);
      if (override) {
        category = override;
        classificationSource = 'override';
      } else {
        const result = await this.classifier.classify({
          merchant: input.merchant,
          description: input.description,
          amount: input.amount,
          direction: input.direction ?? 'expense',
        });
        category = result.category;
        classificationConfidence = result.confidence;
        classificationSource = result.confidence > 0 ? 'classifier' : 'fallback';
      }
    }

    const tx: Transaction = {
      id: await this.repo.nextId(),
      date: input.date ?? formatIso(this.clock.now()),
      amount: input.amount,
      currency: 'ARS',
      category,
      description: input.description,
      merchant: input.merchant,
      classificationSource,
      ...(classificationConfidence !== undefined ? { classificationConfidence } : {}),
      userId: input.userId ?? 'default-user',
      direction: input.direction ?? 'expense',
      status: 'active',
      statusChangedAt: null,
      source: input.source ?? 'manual',
      mpPaymentId: input.mpPaymentId ?? null,
      needsReview: false,
      operationType: null,
      counterparty: input.counterparty ?? null,
    };
    await this.repo.add(tx);
    return { transaction: tx };
  }
}
