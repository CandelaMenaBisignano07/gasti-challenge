export type MpConnection =
  | { connected: false }
  | { connected: true; mpUserIdLast4: string; connectedAt: string };

export interface MpRepository {
  getStatus(): Promise<MpConnection>;
  startConnectUrl(): string;
  disconnect(): Promise<void>;
}
