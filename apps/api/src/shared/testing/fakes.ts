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
import type { BudgetsRepository } from '../../budgets/domain/budgets.repository';
import type { CategoriesRepository } from '../domain/custom-categories';

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
    async reassignCategory(from: Category, to: Category) {
      for (const m of Object.keys(data.merchants)) {
        if (data.merchants[m] === from) data.merchants[m] = to;
      }
      for (const id of Object.keys(data.transactions)) {
        if (data.transactions[id] === from) data.transactions[id] = to;
      }
    },
  };
}

export function fakeBudgetsRepo(
  seed: Record<string, Record<string, number>> = {},
): BudgetsRepository {
  const data = JSON.parse(JSON.stringify(seed)) as Record<string, Record<string, number>>;
  return {
    async forMonth(month) {
      return (data[month] ?? {}) as Partial<Record<Category, number>>;
    },
    async set(month, category, amount) {
      data[month] = { ...(data[month] ?? {}), [category]: amount };
    },
    async clear(month, category) {
      if (data[month]) delete data[month][category];
    },
    async reassignCategory(from, to) {
      for (const month of Object.keys(data)) {
        if (data[month][from] !== undefined) {
          data[month][to] = data[month][from];
          delete data[month][from];
        }
      }
    },
    async clearCategory(category) {
      for (const month of Object.keys(data)) delete data[month][category];
    },
  };
}

export function fakeCategoriesRepo(seed: string[] = []): CategoriesRepository {
  let data = [...seed];
  return {
    async all() {
      return [...data];
    },
    async add(name) {
      if (!data.includes(name)) data.push(name);
    },
    async remove(name) {
      data = data.filter((c) => c !== name);
    },
    async rename(from, to) {
      data = data.map((c) => (c === from ? to : c));
    },
  };
}
