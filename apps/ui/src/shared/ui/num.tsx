import type { NumSize, NumTone } from '@/shared/theme/tokens';

type NumProps = {
  value: number;
  size?: NumSize;
  tone?: NumTone;
  signed?: boolean;
  delta?: boolean;
  percent?: boolean;
  className?: string;
};

const SIZE_CLASS: Record<NumSize, string> = {
  sm: 'num-sm',
  md: 'num-md',
  lg: 'num-lg',
  xl: 'num-xl',
};

const TONE_CLASS: Record<NumTone, string> = {
  ink: 'text-ink-1',
  pos: 'text-pos',
  neg: 'text-neg',
  warn: 'text-warn',
};

const arsFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatValue(value: number, options: { signed: boolean; delta: boolean; percent: boolean }): string {
  const isNeg = value < 0;
  const abs = Math.abs(value);
  const body = arsFormatter.format(abs);

  if (options.percent) {
    if (options.delta) return `${isNeg ? '−' : '+'}${body}%`;
    return `${isNeg ? '−' : ''}${body}%`;
  }

  // Currency
  if (options.delta) {
    return `${isNeg ? '−' : '+'}$${body}`;
  }
  if (options.signed) {
    return `${isNeg ? '−' : ''}$${body}`;
  }
  return `$${body}`;
}

export function Num({
  value,
  size = 'md',
  tone = 'ink',
  signed = false,
  delta = false,
  percent = false,
  className,
}: NumProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const resolvedTone: NumTone =
    tone === 'ink' && (signed || delta)
      ? safeValue < 0
        ? 'neg'
        : safeValue > 0
        ? 'pos'
        : 'ink'
      : tone;

  return (
    <span className={['num', SIZE_CLASS[size], TONE_CLASS[resolvedTone], className].filter(Boolean).join(' ')}>
      {formatValue(safeValue, { signed, delta, percent })}
    </span>
  );
}
