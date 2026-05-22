export type MpConnection =
  | { connected: false }
  | { connected: true; mpUserIdLast4: string; connectedAt: string };

export type BackfillScope = '24h' | '7d' | '15d' | '30d';

export type OperationType =
  | 'regular_payment'
  | 'money_transfer'
  | 'recurring_payment'
  | 'account_fund';

export interface BackfillRunSummary {
  readonly id: string;
  readonly totalImported: number;
  readonly lowConfidenceCount: number;
  readonly truncated: boolean;
  readonly byOperationType: Record<OperationType, number>;
}

export interface MpRepository {
  getStatus(): Promise<MpConnection>;
  startConnectUrl(): string;
  disconnect(): Promise<void>;
  triggerBackfill(scope: BackfillScope): Promise<BackfillRunSummary>;
}
