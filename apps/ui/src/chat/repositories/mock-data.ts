import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';
import rawTransactions from '@data/transactions.json';

/** Shape of a row in the repo-root `data/transactions.json` dataset. */
type RawTransaction = {
  id: string;
  date: string; // yyyy-MM-dd (date-only)
  amount: number; // positive integer — every row is an expense
  currency: 'ARS';
  category: string;
  description: string;
  merchant: string;
};

/**
 * Mock transactions sourced from the real `data/transactions.json` dataset.
 * The dataset stores expenses as positive integers; the domain `Transaction`
 * contract is *negative = expense, positive = income*, so amounts are negated.
 */
export const MOCK_TRANSACTIONS: Transaction[] = (rawTransactions as RawTransaction[]).map(
  (raw): Transaction => ({
    id: raw.id,
    date: raw.date,
    amount: -raw.amount,
    currency: raw.currency,
    category: raw.category,
    description: raw.description,
    merchant: raw.merchant,
  }),
);

export const MOCK_COMIDA_BUDGET: BudgetProgress = {
  category: 'comida',
  budget: 80000,
  spent: 54000,
  projection: 92000,
  periodLabel: 'Mayo 2026',
};
