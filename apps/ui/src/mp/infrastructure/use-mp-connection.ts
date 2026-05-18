'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MpConnection } from '@/mp/domain/mp-connection';
import { HttpMpRepository } from '@/mp/repositories/http-mp-repository';

type UseMpConnection = {
  connection: MpConnection;
  loading: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
};

export function useMpConnection(): UseMpConnection {
  const repo = useMemo(() => new HttpMpRepository(), []);
  const [connection, setConnection] = useState<MpConnection>({ connected: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await repo.getStatus();
    setConnection(next);
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    // Re-read status on mount; also covers the OAuth callback redirect (?mp=connected).
    void refresh();
  }, [refresh]);

  const connect = useCallback(() => {
    window.location.href = repo.startConnectUrl();
  }, [repo]);

  const disconnect = useCallback(async () => {
    await repo.disconnect();
    await refresh();
  }, [repo, refresh]);

  return { connection, loading, connect, disconnect };
}
