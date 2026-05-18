import type { Category } from '@/shared/theme/tokens';

export type BudgetProgress = {
  category: Category | string;
  budget: number;    // ARS — monthly budget
  spent: number;     // ARS — spent so far this month
  remaining: number; // ARS — budget minus spent
  pace: 'under' | 'on' | 'over'; // on-track-at-pace status
  projected: number; // ARS — projected total spend by end of month
};
