'use client';

import { useEffect, useState } from 'react';
import type { BudgetTone } from '@/shared/theme/tokens';

type BarMeterProps = {
  value: number; // 0..1+
  tone: BudgetTone;
  animateOnMount?: boolean;
  ariaLabel?: string;
  className?: string;
};

const FILL: Record<BudgetTone, string> = {
  pos: 'bg-pos',
  warn: 'bg-warn',
  neg: 'bg-neg',
};

export function BarMeter({ value, tone, animateOnMount = true, ariaLabel, className }: BarMeterProps) {
  const target = Math.min(Math.max(value, 0), 1);
  const [displayed, setDisplayed] = useState(animateOnMount ? 0 : target);

  useEffect(() => {
    if (!animateOnMount) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplayed(target);
      return;
    }
    const id = requestAnimationFrame(() => setDisplayed(target));
    return () => cancelAnimationFrame(id);
  }, [animateOnMount, target]);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(target * 100)}
      aria-label={ariaLabel}
      className={['h-[6px] w-full rounded-pill bg-surface-3 overflow-hidden', className].filter(Boolean).join(' ')}
    >
      <div
        className={[
          'h-full rounded-pill transition-[width] duration-base ease-out',
          FILL[tone],
        ].join(' ')}
        style={{ width: `${displayed * 100}%` }}
      />
    </div>
  );
}
