import type { BackfillSummary } from './backfill-summary';

export const BACKFILL_SUMMARIES_REPOSITORY = 'BACKFILL_SUMMARIES_REPOSITORY';

export interface BackfillSummariesRepository {
  create(summary: Omit<BackfillSummary, 'id' | 'createdAt'>): Promise<BackfillSummary>;
  getById(userId: string, id: string): Promise<BackfillSummary | null>;
  listForUser(userId: string): Promise<BackfillSummary[]>;
  markDismissed(id: string): Promise<void>;
}
