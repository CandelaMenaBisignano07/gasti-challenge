import type { Transaction } from '../../shared/domain/transaction';

export const TRANSACTIONS_REPOSITORY = 'TRANSACTIONS_REPOSITORY';

export type TransactionFields = Partial<Omit<Transaction, 'id' | 'currency'>>;

export interface TransactionsRepository {
  all(): Promise<Transaction[]>;
  add(tx: Transaction): Promise<void>;
  update(id: string, fields: TransactionFields): Promise<Transaction | null>;
  delete(id: string): Promise<boolean>;
  nextId(): Promise<string>;
}
