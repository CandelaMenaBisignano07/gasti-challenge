import type { Clock } from '../providers/clock';
import type { Transaction } from '../domain/transaction';
import type { Category } from '../domain/category';
import type {
  TransactionFields,
  TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import type {
  CategorizationRepository,
  CategoryOverrides,
} from '../domain/category-overrides';

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(`${iso}T12:00:00.000Z`) };
}

export function fakeTransactionsRepo(seed: Transaction[] = []): TransactionsRepository {
  let txs = seed.map((t) => ({ ...t }));
  return {
    async all() {
      return txs.map((t) => ({ ...t }));
    },
    async add(tx) {
      txs.push({ ...tx });
    },
    async update(id, fields: TransactionFields) {
      const i = txs.findIndex((t) => t.id === id);
      if (i === -1) return null;
      txs[i] = { ...txs[i], ...fields };
      return { ...txs[i] };
    },
    async delete(id) {
      const before = txs.length;
      txs = txs.filter((t) => t.id !== id);
      return txs.length < before;
    },
    async nextId() {
      return `txn_${String(txs.length + 1).padStart(3, '0')}`;
    },
    async reassignCategory(from, to) {
      for (const t of txs) if (t.category === from) t.category = to;
    },
  };
}

export function fakeCategorizationRepo(
  seed: Partial<CategoryOverrides> = {},
): CategorizationRepository {
  const data: CategoryOverrides = {
    merchants: { ...seed.merchants },
    transactions: { ...seed.transactions },
  };
  return {
    async overrides() {
      return { merchants: { ...data.merchants }, transactions: { ...data.transactions } };
    },
    async setMerchant(merchant, category: Category) {
      data.merchants[merchant] = category;
    },
    async setTransaction(transactionId, category: Category) {
      data.transactions[transactionId] = category;
    },
  };
}
