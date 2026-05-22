'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMpConnection } from '@/mp/infrastructure/use-mp-connection';

export default function MpCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useMpConnection();

  useEffect(() => {
    // The backend already completed the token exchange before redirecting here;
    // we refresh local connection status, then the user picks a backfill scope.
    void refresh();
  }, [refresh]);

  if (params.get('error')) {
    return (
      <div className="grid min-h-screen place-items-center p-s4">
        <div className="font-display text-[15px] text-ink-2">
          Conexión cancelada.{' '}
          <a
            className="underline"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              router.replace('/');
            }}
          >
            Volver
          </a>
        </div>
      </div>
    );
  }

  // T22 lands the actual BackfillModal here. For now, show a placeholder so the
  // route renders and the OAuth-then-callback flow can be tested end-to-end.
  return (
    <div className="grid min-h-screen place-items-center p-s4">
      <div className="font-display text-[15px] text-ink-2">
        Conectado. Elegí un rango (próximamente).{' '}
        <a
          className="underline"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            router.replace('/');
          }}
        >
          Continuar
        </a>
      </div>
    </div>
  );
}
