import type { Category } from '@/shared/theme/tokens';

export type BudgetProgress = {
  category: Category | string;
  budget: number;        // ARS
  spent: number;         // ARS
  projection: number;    // ARS — projected total spend by end of period
  periodLabel: string;   // e.g. "Mayo 2026"
};
