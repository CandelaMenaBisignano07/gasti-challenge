import { Injectable } from '@nestjs/common';
import type { BackfillSummary } from '../domain/backfill-summary';
import type { PendingPrompt } from '../domain/pending-prompt';
import type { ProactiveEventBus } from '../domain/proactive-event-bus';

type PromptHandler = (p: PendingPrompt) => void;
type SummaryHandler = (s: BackfillSummary) => void;

@Injectable()
export class InMemoryProactiveEventBus implements ProactiveEventBus {
  private byUser = new Map<string, Set<PromptHandler>>();
  // Parallel Map for backfill summaries — keeping the channels separate avoids
  // forcing every existing prompt subscriber to handle a union type.
  private summariesByUser = new Map<string, Set<SummaryHandler>>();

  publish(userId: string, prompt: PendingPrompt): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    // Snapshot: a handler may subscribe/unsubscribe during dispatch.
    for (const fn of [...set]) fn(prompt);
  }

  subscribe(userId: string, fn: PromptHandler): () => void {
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      // Reclaim the bucket once empty so the Map doesn't grow one entry per user forever.
      if (set!.size === 0) this.byUser.delete(userId);
    };
  }

  publishBackfillSummary(userId: string, summary: BackfillSummary): void {
    const set = this.summariesByUser.get(userId);
    if (!set) return;
    for (const fn of [...set]) fn(summary);
  }

  subscribeBackfillSummaries(userId: string, fn: SummaryHandler): () => void {
    let set = this.summariesByUser.get(userId);
    if (!set) {
      set = new Set();
      this.summariesByUser.set(userId, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.summariesByUser.delete(userId);
    };
  }
}
