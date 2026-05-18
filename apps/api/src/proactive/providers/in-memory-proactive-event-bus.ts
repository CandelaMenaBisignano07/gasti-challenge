import { Injectable } from '@nestjs/common';
import type { PendingPrompt } from '../domain/pending-prompt';
import type { ProactiveEventBus } from '../domain/proactive-event-bus';

@Injectable()
export class InMemoryProactiveEventBus implements ProactiveEventBus {
  private byUser = new Map<string, Set<(p: PendingPrompt) => void>>();

  publish(userId: string, prompt: PendingPrompt): void {
    this.byUser.get(userId)?.forEach((fn) => fn(prompt));
  }

  subscribe(userId: string, fn: (p: PendingPrompt) => void): () => void {
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(fn);
    return () => this.byUser.get(userId)?.delete(fn);
  }
}
