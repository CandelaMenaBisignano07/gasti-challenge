import { Settings } from 'lucide-react';
import { ThemeToggle } from '@/shared/ui/theme-toggle';

type HeaderProps = {
  variant?: 'frosted' | 'solid';
};

export function Header({ variant = 'solid' }: HeaderProps) {
  const surface =
    variant === 'frosted'
      ? 'bg-surface-frost border-b border-line-mesh backdrop-blur-1'
      : 'bg-surface-1 border-b border-line-1';

  return (
    <header
      className={['sticky top-0 z-10 flex h-14 items-center justify-between px-s4 sm:px-s6 lg:px-s7', surface].join(' ')}
    >
      <div className="font-display text-[18px] font-semibold tracking-tight text-ink-1">Gasti</div>
      <div className="flex items-center gap-s1">
        <ThemeToggle />
        <button
          type="button"
          aria-label="Ajustes"
          className="inline-flex h-11 w-11 items-center justify-center rounded-pill text-ink-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        >
          <Settings size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
