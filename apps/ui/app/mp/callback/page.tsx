'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackfillModal } from '@/mp/components/backfill-modal';
import { useMpConnection } from '@/mp/infrastructure/use-mp-connection';
import { MeshBackground } from '@/shared/mesh/mesh-background';

function MpCallbackInner() {
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

  return (
    <>
      <MeshBackground />
      <BackfillModal
        onDone={(summary) => {
          if (summary) {
            try {
              sessionStorage.setItem('gasti-backfill-pending', JSON.stringify(summary));
            } catch {
              // SSR / disabled storage — fall through; the card just doesn't appear.
            }
          }
          router.replace('/');
        }}
      />
    </>
  );
}

export default function MpCallbackPage() {
  return (
    <Suspense fallback={null}>
      <MpCallbackInner />
    </Suspense>
  );
}
