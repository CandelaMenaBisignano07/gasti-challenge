'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/shared/theme/theme-provider';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const ICON: Record<ThemePreference, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LABEL_ES: Record<ThemePreference, string> = {
  system: 'Tema: sistema',
  light: 'Tema: claro',
  dark: 'Tema: oscuro',
};

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];

  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[preference])}
      aria-label={LABEL_ES[preference]}
      aria-pressed={preference !== 'system'}
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
