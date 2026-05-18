import type { PendingPrompt } from './pending-prompt';

export type ProactiveEvent =
  | { kind: 'created'; prompt: PendingPrompt }
  | { kind: 'resolved'; prompt: PendingPrompt };

export interface ResolveInput {
  action: 'add' | 'discard';
  overrides?: { category?: string; description?: string; rememberMerchantCategory?: boolean };
}

export interface ProactiveRepository {
  listPending(): Promise<PendingPrompt[]>;
  stream(onEvent: (e: ProactiveEvent) => void): () => void;
  resolve(id: string, input: ResolveInput): Promise<PendingPrompt>;
}
