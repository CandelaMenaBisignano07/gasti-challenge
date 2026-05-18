import type { PendingPrompt } from '@/proactive/domain/pending-prompt';
import type {
  ProactiveEvent,
  ProactiveRepository,
  ResolveInput,
} from '@/proactive/domain/proactive-repository';

const DEFAULT_API_BASE_URL = 'http://localhost:3001';

export class HttpProactiveRepository implements ProactiveRepository {
  private readonly base: string;

  constructor(base: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL) {
    this.base = base;
  }

  async listPending(): Promise<PendingPrompt[]> {
    try {
      const res = await fetch(`${this.base}/proactive/pending`, { credentials: 'include' });
      if (!res.ok) return [];
      const body = (await res.json()) as { prompts: PendingPrompt[] };
      return body.prompts ?? [];
    } catch {
      return [];
    }
  }

  stream(onEvent: (e: ProactiveEvent) => void): () => void {
    const source = new EventSource(`${this.base}/proactive/stream`, { withCredentials: true });

    source.addEventListener('prompt.created', (e) => {
      const prompt = JSON.parse((e as MessageEvent).data) as PendingPrompt;
      onEvent({ kind: 'created', prompt });
    });

    source.addEventListener('prompt.resolved', (e) => {
      const prompt = JSON.parse((e as MessageEvent).data) as PendingPrompt;
      onEvent({ kind: 'resolved', prompt });
    });

    // EventSource auto-reconnects after an error; once it reopens, backfill any
    // prompts missed during the gap by replaying them as `created` events.
    let sawError = false;
    source.addEventListener('error', () => {
      sawError = true;
    });
    source.addEventListener('open', () => {
      if (!sawError) return;
      sawError = false;
      void this.listPending().then((prompts) => {
        for (const prompt of prompts) onEvent({ kind: 'created', prompt });
      });
    });

    return () => source.close();
  }

  async resolve(id: string, input: ResolveInput): Promise<PendingPrompt> {
    const res = await fetch(`${this.base}/proactive/${id}/resolve`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { prompt: PendingPrompt };
    return body.prompt;
  }
}
