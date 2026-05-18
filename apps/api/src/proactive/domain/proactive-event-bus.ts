import type { PendingPrompt } from './pending-prompt';

export const PROACTIVE_EVENT_BUS = 'PROACTIVE_EVENT_BUS';

export interface ProactiveEventBus {
  publish(userId: string, prompt: PendingPrompt): void;
  subscribe(userId: string, fn: (p: PendingPrompt) => void): () => void;
}
