'use client';

import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useMpConnection } from '@/mp/infrastructure/use-mp-connection';
import { MpConnectionPopover } from '@/mp/components/mp-connection-popover';

const CHIP_CLASSES = [
  'inline-flex items-center gap-s2 rounded-pill',
  'bg-surface-tint border border-line-1 text-ai-ink',
  'px-s3 py-s1 font-display text-[13px] leading-none',
  'transition-transform duration-fast ease-out active:scale-[0.985]',
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
].join(' ');

export function MercadoPagoChip() {
  const { connection, connect, disconnect } = useMpConnection();
  const [open, setOpen] = useState(false);

  if (!connection.connected) {
    return (
      <button type="button" onClick={connect} className={CHIP_CLASSES}>
        <Wallet size={16} />
        Conectá Mercado Pago
      </button>
    );
  }

  const handleDisconnect = async () => {
    await disconnect();
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={CHIP_CLASSES}
      >
        <Wallet size={16} />
        Mercado Pago
        <span
          aria-hidden
          className="h-1 w-1 rounded-pill"
          style={{ background: 'var(--pos)' }}
        />
      </button>
      {open ? (
        <MpConnectionPopover
          mpUserIdLast4={connection.mpUserIdLast4}
          connectedAt={connection.connectedAt}
          onDisconnect={handleDisconnect}
        />
      ) : null}
    </div>
  );
}
