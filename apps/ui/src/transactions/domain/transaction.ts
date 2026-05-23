import type { Category } from '@/shared/theme/tokens';

export type TransactionDirection = 'income' | 'expense';
export type TransactionStatus = 'active' | 'refunded' | 'charged_back';
export type TransactionSource = 'manual' | 'mercadopago';
export type TransactionOperationType =
  | 'regular_payment'
  | 'money_transfer'
  | 'recurring_payment';

export type Transaction = {
  id: string;
  date: string; // yyyy-MM-dd (date-only), matches the agent
  amount: number; // ARS, positive — sign comes from `direction`
  currency: 'ARS';
  category: Category | string;
  description: string;
  merchant: string;
  // The fields below mirror what apps/api persists. They are optional on the
  // UI side so legacy mock data and older tool results keep working.
  direction?: TransactionDirection;
  status?: TransactionStatus;
  source?: TransactionSource;
  mpPaymentId?: string | null;
  needsReview?: boolean;
  operationType?: TransactionOperationType | null;
  // Human-readable other party. For MP income, this is the payer's name.
  // Null for expenses (merchant already conveys it) and manual rows.
  counterparty?: string | null;
};
