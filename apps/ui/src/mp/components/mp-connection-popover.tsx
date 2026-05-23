'use client';

import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';

const DATE_FMT = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatConnectedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT.format(d);
}

type MpConnectionPopoverProps = {
  mpUserIdLast4: string;
  connectedAt: string;
  onDisconnect: () => void;
};

export function MpConnectionPopover({
  mpUserIdLast4,
  connectedAt,
  onDisconnect,
}: MpConnectionPopoverProps) {
  return (
    <Card
      variant="plain"
      radius="lg"
      elevation={3}
      role="dialog"
      aria-label="Cuenta de Mercado Pago"
      className="absolute bottom-full left-0 z-10 mb-s2 w-64 px-s4 py-s3"
    >
      <p className="font-display text-[13px] leading-[1.5] text-ink-2">
        Cuenta •••• {mpUserIdLast4}
      </p>
      <p className="mt-s1 font-display text-[12px] leading-[1.5] text-ink-4">
        Conectada el {formatConnectedAt(connectedAt)}
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDisconnect}
        className="mt-s3 w-full"
      >
        Desconectar
      </Button>
    </Card>
  );
}
