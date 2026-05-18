import type { Category } from '@/shared/theme/tokens';

export type Transaction = {
  id: string;
  date: string; // yyyy-MM-dd (date-only), matches the agent
  amount: number; // ARS, positive — every transaction is an expense
  currency: 'ARS';
  category: Category | string;
  description: string;
  merchant: string;
};
