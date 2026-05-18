'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PendingPrompt } from '@/proactive/domain/pending-prompt';
import type { ResolveInput } from '@/proactive/domain/proactive-repository';
import { HttpProactiveRepository } from '@/proactive/repositories/http-proactive-repository';
import { makeResolvePrompt } from '@/proactive/use-cases/resolve-prompt';

export type ProactiveContextValue = {
  prompts: PendingPrompt[];
  resolve: (id: string, input: ResolveInput) => Promise<PendingPrompt>;
};

export const ProactiveContext = createContext<ProactiveContextValue | null>(null);

function upsert(prompts: PendingPrompt[], next: PendingPrompt): PendingPrompt[] {
  const idx = prompts.findIndex((p) => p.id === next.id);
  if (idx === -1) return [...prompts, next];
  const copy = prompts.slice();
  copy[idx] = next;
  return copy;
}

export function ProactiveProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => new HttpProactiveRepository(), []);
  const resolvePrompt = useMemo(() => makeResolvePrompt({ repo }), [repo]);

  const [prompts, setPrompts] = useState<PendingPrompt[]>([]);

  useEffect(() => {
    let active = true;

    // Seed with whatever is already pending, then subscribe to live updates.
    void repo.listPending().then((seed) => {
      if (active) setPrompts(seed);
    });

    const teardown = repo.stream((e) => {
      if (!active) return;
      // Both `created` (incl. reconnect backfill) and `resolved` map to an
      // upsert keyed by prompt id, so the order they arrive in is irrelevant.
      setPrompts((current) => upsert(current, e.prompt));
    });

    return () => {
      active = false;
      teardown();
    };
  }, [repo]);

  const resolve = useCallback(
    async (id: string, input: ResolveInput) => {
      const updated = await resolvePrompt(id, input);
      setPrompts((current) => upsert(current, updated));
      return updated;
    },
    [resolvePrompt],
  );

  const value = useMemo<ProactiveContextValue>(() => ({ prompts, resolve }), [prompts, resolve]);

  return <ProactiveContext.Provider value={value}>{children}</ProactiveContext.Provider>;
}
