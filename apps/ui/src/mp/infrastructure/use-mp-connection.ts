'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BackfillRunSummary,
  BackfillScope,
  MpConnection,
} from '@/mp/domain/mp-connection';
import { HttpMpRepository } from '@/mp/repositories/http-mp-repository';

type UseMpConnection = {
  connection: MpConnection;
  loading: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  triggerBackfill: (scope: BackfillScope) => Promise<BackfillRunSummary>;
  pendingBackfillOffer: boolean;
  clearBackfillOffer: () => void;
};

export function useMpConnection(): UseMpConnection {
  const repo = useMemo(() => new HttpMpRepository(), []);
  const [connection, setConnection] = useState<MpConnection>({ connected: false });
  const [loading, setLoading] = useState(true);
  // The offer is surfaced by a later task that reads a URL query param; T21 only
  // installs the state so consumers can wire up to it. Defaults to false.
  const [pendingBackfillOffer, setPendingBackfillOffer] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await repo.getStatus();
    setConnection(next);
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    // Re-read status on mount; also covers the OAuth callback redirect (/mp/callback).
    void refresh();
  }, [refresh]);

  const connect = useCallback(() => {
    window.location.href = repo.startConnectUrl();
  }, [repo]);

  const disconnect = useCallback(async () => {
    await repo.disconnect();
    await refresh();
  }, [repo, refresh]);

  const triggerBackfill = useCallback(
    (scope: BackfillScope) => repo.triggerBackfill(scope),
    [repo],
  );

  const clearBackfillOffer = useCallback(() => setPendingBackfillOffer(false), []);

  return {
    connection,
    loading,
    connect,
    disconnect,
    refresh,
    triggerBackfill,
    pendingBackfillOffer,
    clearBackfillOffer,
  };
}
