import type {
  BackfillRunSummary,
  BackfillScope,
  MpConnection,
  MpRepository,
  OperationType,
} from '@/mp/domain/mp-connection';

const DEFAULT_API_BASE_URL = 'http://localhost:3001';

export class HttpMpRepository implements MpRepository {
  private readonly base: string;

  constructor(base: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL) {
    this.base = base;
  }

  startConnectUrl(): string {
    return `${this.base}/mp/oauth/start`;
  }

  async getStatus(): Promise<MpConnection> {
    try {
      const res = await fetch(`${this.base}/mp/oauth/status`, { credentials: 'include' });
      if (!res.ok) return { connected: false };
      return (await res.json()) as MpConnection;
    } catch {
      return { connected: false };
    }
  }

  async disconnect(): Promise<void> {
    await fetch(`${this.base}/mp/oauth/disconnect`, {
      method: 'POST',
      credentials: 'include',
    });
  }

  async triggerBackfill(scope: BackfillScope): Promise<BackfillRunSummary> {
    const res = await fetch(`${this.base}/mp/backfill`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope }),
    });
    if (!res.ok) throw new Error(`backfill failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      id: string;
      totalImported: number;
      lowConfidenceCount: number;
      truncated: boolean;
      byOperationType: Record<OperationType, number>;
    };
    return {
      id: data.id,
      totalImported: data.totalImported,
      lowConfidenceCount: data.lowConfidenceCount,
      truncated: data.truncated,
      byOperationType: data.byOperationType,
    };
  }
}
