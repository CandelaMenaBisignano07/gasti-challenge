import type { BackfillSummary } from './backfill-summary';
import type { PendingPrompt } from './pending-prompt';

export const PROACTIVE_EVENT_BUS = 'PROACTIVE_EVENT_BUS';

/**
 * Two-channel bus: prompts and backfill summaries travel on separate
 * subscriber maps so the existing prompt SSE wiring is untouched. The SSE
 * controller will subscribe to both and discriminate with a `kind` field
 * when the streaming endpoint is updated.
 */
export interface ProactiveEventBus {
  publish(userId: string, prompt: PendingPrompt): void;
  subscribe(userId: string, fn: (p: PendingPrompt) => void): () => void;
  publishBackfillSummary(userId: string, summary: BackfillSummary): void;
  subscribeBackfillSummaries(
    userId: string,
    fn: (s: BackfillSummary) => void,
  ): () => void;
}
