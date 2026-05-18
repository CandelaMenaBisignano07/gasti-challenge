'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/shared/theme/theme-provider';

export function ThemeToggle() {
  const { preference, toggle } = useTheme();
  const isDark = preference === 'dark';
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      aria-pressed={isDark}
      className={[
        'inline-flex h-11 w-11 items-center justify-center rounded-pill',
        'text-ink-2 transition-transform duration-fast ease-out active:scale-[0.985]',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
      ].join(' ')}
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
