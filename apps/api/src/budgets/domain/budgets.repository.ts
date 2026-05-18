import type { Category } from '../../shared/domain/category';

export const BUDGETS_REPOSITORY = 'BUDGETS_REPOSITORY';

export interface BudgetsRepository {
  /** Budgeted amounts for one `yyyy-MM`, keyed by category. */
  forMonth(month: string): Promise<Partial<Record<Category, number>>>;
  set(month: string, category: Category, amount: number): Promise<void>;
  clear(month: string, category: Category): Promise<void>;
  /** Move the budget under `from` to `to`, in every month it appears. */
  reassignCategory(from: string, to: string): Promise<void>;
  /** Remove the budget under `category`, in every month. */
  clearCategory(category: string): Promise<void>;
}
