import type { Category } from '../../shared/domain/category';

export const BUDGETS_REPOSITORY = 'BUDGETS_REPOSITORY';

export interface BudgetsRepository {
  /** Budgeted amounts for one `yyyy-MM`, keyed by category. */
  forMonth(month: string): Promise<Partial<Record<Category, number>>>;
  set(month: string, category: Category, amount: number): Promise<void>;
  clear(month: string, category: Category): Promise<void>;
}
