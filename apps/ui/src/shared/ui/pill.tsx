import type { HTMLAttributes, ReactNode } from 'react';

type PillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'ai';
  children: ReactNode;
};

const TONE: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: 'bg-surface-tint text-ink-2 border border-line-1',
  ai: 'bg-surface-tint text-ai-ink border border-line-1',
};

export function Pill({ tone = 'neutral', className, children, ...rest }: PillProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-pill px-s3 py-[3px]',
        'font-display text-[11px] font-medium leading-none tracking-label',
        TONE[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
