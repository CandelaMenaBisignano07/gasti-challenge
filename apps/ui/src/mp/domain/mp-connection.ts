export type MpConnection =
  | { connected: false }
  | { connected: true; mpUserIdLast4: string; connectedAt: string };

export type BackfillScope = '24h' | '7d' | '15d' | '30d';

export interface BackfillRunSummary {
  readonly id: string;
  readonly totalImported: number;
  readonly lowConfidenceCount: number;
  readonly truncated: boolean;
}

export interface MpRepository {
  getStatus(): Promise<MpConnection>;
  startConnectUrl(): string;
  disconnect(): Promise<void>;
  triggerBackfill(scope: BackfillScope): Promise<BackfillRunSummary>;
}
