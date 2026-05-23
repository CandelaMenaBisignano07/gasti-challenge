'use client';

import { useEffect, useRef, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useMpConnection } from '@/mp/infrastructure/use-mp-connection';
import { MpConnectionPopover } from '@/mp/components/mp-connection-popover';

const BASE_CHIP = [
  'inline-flex items-center gap-s2 rounded-pill border',
  'px-s3 py-s1 font-display text-[13px] leading-none',
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
].join(' ');

const INTERACTIVE = 'transition-transform duration-fast ease-out active:scale-[0.985]';

const NEUTRAL_CHIP = `${BASE_CHIP} ${INTERACTIVE} bg-surface-tint border-line-1 text-ai-ink`;

const LOADING_CHIP = [
  BASE_CHIP,
  'bg-surface-tint border-line-1 text-ink-4',
  'pointer-events-none cursor-not-allowed animate-pulse',
].join(' ');

// Mercado Pago brand cyan, with light/dark variants. Inline arbitrary values
// (no new design tokens) since this colour set is specific to one external
// service and shouldn't bleed into the broader system.
const CONNECTED_CHIP = [
  BASE_CHIP,
  INTERACTIVE,
  'bg-[#E6F6FC] border-[#A6E2F4] text-[#003B66]',
  'dark:bg-[#003344]/45 dark:border-[#0099D6]/40 dark:text-[#A6E2F4]',
].join(' ');

export function MercadoPagoChip() {
  const { connection, loading, connect, disconnect } = useMpConnection();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Dismiss the popover on outside click or Escape. Mounted only while open so
  // we don't leak listeners on the idle path.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-busy="true"
        className={LOADING_CHIP}
      >
        <Wallet size={16} />
        Verificando…
      </button>
    );
  }

  if (!connection.connected) {
    return (
      <button type="button" onClick={connect} className={NEUTRAL_CHIP}>
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
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={CONNECTED_CHIP}
      >
        <Wallet size={16} className="text-[#0099D6] dark:text-[#7FD1F4]" />
        Mercado Pago
        <span aria-hidden className="relative ml-s1 inline-flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full rounded-pill animate-ping"
            style={{ background: 'var(--pos)', opacity: 0.55 }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-pill"
            style={{ background: 'var(--pos)' }}
          />
        </span>
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
