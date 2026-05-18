import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { formatIso } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type { Transaction } from '../../shared/domain/transaction';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from '../domain/transactions.repository';

export interface AddTransactionInput {
  date?: string;
  amount: number;
  category?: Category;
  description: string;
  merchant: string;
}

@Injectable()
export class AddTransaction {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
    private readonly categories: CategoryResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: AddTransactionInput): Promise<{ transaction: Transaction }> {
    const category =
      input.category ?? (await this.categories.categoryForMerchant(input.merchant)) ?? 'otros';
    const tx: Transaction = {
      id: await this.repo.nextId(),
      date: input.date ?? formatIso(this.clock.now()),
      amount: input.amount,
      currency: 'ARS',
      category,
      description: input.description,
      merchant: input.merchant,
    };
    await this.repo.add(tx);
    return { transaction: tx };
  }
}
