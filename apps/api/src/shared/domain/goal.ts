import type { Category } from './category';

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  linkedCategory: Category | null;
  createdAt: string;
}
