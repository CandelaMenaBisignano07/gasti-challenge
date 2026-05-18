import type { Goal } from '../../shared/domain/goal';

export const GOALS_REPOSITORY = 'GOALS_REPOSITORY';

export type GoalDraft = Omit<Goal, 'id' | 'createdAt'>;

export interface GoalsRepository {
  all(): Promise<Goal[]>;
  getById(id: string): Promise<Goal | null>;
  /** Upsert by case-insensitive name: same name updates, otherwise creates. */
  upsertByName(draft: GoalDraft, createdAt: string): Promise<Goal>;
  delete(id: string): Promise<boolean>;
}
