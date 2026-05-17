import { Inject, Injectable } from '@nestjs/common';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import type { Category } from '../../shared/domain/category';
import type { Period } from '../../shared/domain/period';
import type { Transaction } from '../../shared/domain/transaction';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionFields,
  type TransactionsRepository,
} from '../domain/transactions.repository';

export interface ProposeMutationInput {
  intent: 'delete' | 'update';
  selector: {
    transactionId?: string;
    merchant?: string;
    category?: Category;
    period?: Period;
  };
  proposedFields?: TransactionFields;
}

@Injectable()
export class ProposeTransactionMutation {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
    private readonly periods: PeriodResolver,
    private readonly categories: CategoryResolver,
  ) {}

  async execute(input: ProposeMutationInput): Promise<{
    intent: 'delete' | 'update';
    matches: Transaction[];
    proposedFields?: TransactionFields;
  }> {
    const txs = await this.repo.all();
    const sel = input.selector;
    let matches = txs;

    if (sel.transactionId) {
      matches = matches.filter((t) => t.id === sel.transactionId);
    } else {
      if (sel.merchant) {
        const needle = sel.merchant.toLowerCase();
        matches = matches.filter((t) => t.merchant.toLowerCase().includes(needle));
      }
      if (sel.period) {
        const range = this.periods.resolve(sel.period);
        matches = matches.filter((t) => t.date >= range.from && t.date <= range.to);
      }
      if (sel.category) {
        const cats = await this.categories.resolveAll(txs);
        matches = matches.filter((t) => cats.get(t.id) === sel.category);
      }
    }

    return {
      intent: input.intent,
      matches,
      ...(input.proposedFields ? { proposedFields: input.proposedFields } : {}),
    };
  }
}
