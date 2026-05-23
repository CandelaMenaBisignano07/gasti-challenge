import type {
  Transaction,
  TransactionDirection,
  TransactionSource,
  TransactionStatus,
} from '../../shared/domain/transaction';
import type { OperationType } from '../../mp/domain/operation-type';

export const TRANSACTIONS_REPOSITORY = 'TRANSACTIONS_REPOSITORY';

export type TransactionFields = Partial<Omit<Transaction, 'id' | 'currency'>>;

/** Input for `TransactionsRepository.create` — the repository fills `id`,
 * defaults (`currency`, `statusChangedAt`), and validates via `transactionSchema`. */
export interface CreateTransactionInput {
  readonly userId: string;
  readonly amount: number;
  readonly category: Transaction['category'];
  readonly description: string;
  readonly merchant: string;
  readonly date: string; // YYYY-MM-DD
  readonly direction: TransactionDirection;
  readonly source: TransactionSource;
  readonly status?: TransactionStatus;
  readonly mpPaymentId?: string | null;
  readonly needsReview?: boolean;
  readonly operationType?: OperationType | null;
  readonly counterparty?: string | null;
}

export interface TransactionsRepository {
  all(): Promise<Transaction[]>;
  add(tx: Transaction): Promise<void>;
  create(input: CreateTransactionInput): Promise<Transaction>;
  update(id: string, fields: TransactionFields): Promise<Transaction | null>;
  delete(id: string): Promise<boolean>;
  nextId(): Promise<string>;
  /** Rewrite the base category of every transaction whose category is `from`. */
  reassignCategory(from: string, to: string): Promise<void>;
  getById(userId: string, id: string): Promise<Transaction | null>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<Transaction | null>;
  updateStatus(id: string, newStatus: TransactionStatus, at: Date): Promise<void>;
}
