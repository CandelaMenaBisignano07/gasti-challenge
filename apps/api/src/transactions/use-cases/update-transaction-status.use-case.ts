import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../domain/transactions.repository';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import type { TransactionStatus } from '../../shared/domain/transaction';

@Injectable()
export class UpdateTransactionStatus {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    transactionId: string;
    newStatus: TransactionStatus;
    newStatusDetail: string | null;
  }): Promise<void> {
    await this.repo.updateStatus(
      input.transactionId,
      input.newStatus,
      input.newStatusDetail,
      this.clock.now(),
    );
  }
}
