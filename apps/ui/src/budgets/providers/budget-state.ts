import type { BudgetTone } from '@/shared/theme/tokens';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

export function resolveBudgetTone(progress: BudgetProgress): BudgetTone {
  if (progress.budget <= 0) return 'pos';
  const ratio = progress.projected / progress.budget;
  if (ratio <= 0.85) return 'pos';
  if (ratio <= 1.0) return 'warn';
  return 'neg';
}

export function resolveBudgetFraction(progress: BudgetProgress): number {
  if (progress.budget <= 0) return 0;
  return progress.spent / progress.budget;
}
