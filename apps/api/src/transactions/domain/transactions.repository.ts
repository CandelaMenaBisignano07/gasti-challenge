import type { Transaction, TransactionStatus } from '../../shared/domain/transaction';

export const TRANSACTIONS_REPOSITORY = 'TRANSACTIONS_REPOSITORY';

export type TransactionFields = Partial<Omit<Transaction, 'id' | 'currency'>>;

export interface TransactionsRepository {
  all(): Promise<Transaction[]>;
  add(tx: Transaction): Promise<void>;
  update(id: string, fields: TransactionFields): Promise<Transaction | null>;
  delete(id: string): Promise<boolean>;
  nextId(): Promise<string>;
  /** Rewrite the base category of every transaction whose category is `from`. */
  reassignCategory(from: string, to: string): Promise<void>;
  getById(userId: string, id: string): Promise<Transaction | null>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<Transaction | null>;
  updateStatus(id: string, newStatus: TransactionStatus, at: Date): Promise<void>;
}
