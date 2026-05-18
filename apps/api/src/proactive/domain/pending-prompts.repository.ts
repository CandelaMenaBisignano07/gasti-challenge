import type { NoticeReason, PendingPrompt } from './pending-prompt';

export const PENDING_PROMPTS_REPOSITORY = 'PENDING_PROMPTS_REPOSITORY';
export type NewPendingPrompt = Omit<PendingPrompt, 'resolvedTransactionId' | 'resolvedAt'>;

export interface PendingPromptsRepository {
  create(p: NewPendingPrompt): Promise<PendingPrompt>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<PendingPrompt | null>;
  listPending(userId: string): Promise<PendingPrompt[]>;
  getById(userId: string, id: string): Promise<PendingPrompt | null>;
  markAdded(id: string, txId: string): Promise<void>;
  markDiscarded(id: string, reason?: NoticeReason): Promise<void>;
}
