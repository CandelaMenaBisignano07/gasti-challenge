import type { Category } from '@/shared/theme/tokens';

export type Transaction = {
  id: string;
  date: string; // ISO yyyy-MM-ddTHH:mm:ss
  amount: number; // ARS; negative = expense, positive = income
  currency: 'ARS';
  category: Category | string;
  description: string;
  merchant: string;
};
