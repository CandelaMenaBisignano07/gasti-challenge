'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ButtonSize, ButtonVariant } from '@/shared/theme/tokens';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const BASE = [
  'inline-flex items-center justify-center gap-2',
  'rounded-pill font-display font-semibold',
  'transition-transform duration-fast ease-out',
  'active:scale-[0.985]',
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
  'disabled:opacity-30 disabled:pointer-events-none',
].join(' ');

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "text-white shadow-brand-glow [background:var(--brand-grad)]",
  secondary: 'bg-surface-0 border border-line-2 text-ink-1 hover:shadow-2',
  frosted:
    'bg-surface-frost-2 border border-line-mesh backdrop-blur-2 text-ink-1',
  ghost: 'bg-transparent text-ai-ink',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'h-11 px-s6 text-[14px] leading-none',
  sm: 'h-9  px-s5 text-[13px] leading-none',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={[BASE, VARIANT[variant], SIZE[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
