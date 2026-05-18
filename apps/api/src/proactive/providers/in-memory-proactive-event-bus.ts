import { Injectable } from '@nestjs/common';
import type { PendingPrompt } from '../domain/pending-prompt';
import type { ProactiveEventBus } from '../domain/proactive-event-bus';

type Handler = (p: PendingPrompt) => void;

@Injectable()
export class InMemoryProactiveEventBus implements ProactiveEventBus {
  private byUser = new Map<string, Set<Handler>>();

  publish(userId: string, prompt: PendingPrompt): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    // Snapshot: a handler may subscribe/unsubscribe during dispatch.
    for (const fn of [...set]) fn(prompt);
  }

  subscribe(userId: string, fn: Handler): () => void {
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
}
