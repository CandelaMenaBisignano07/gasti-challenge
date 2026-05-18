import { ThemeToggle } from '@/shared/ui/theme-toggle';

type HeaderProps = {
  variant?: 'frosted' | 'solid';
  onTitleClick?: () => void;
};

export function Header({ variant = 'solid', onTitleClick }: HeaderProps) {
  const surface =
    variant === 'frosted'
      ? 'bg-surface-frost border-b border-line-mesh backdrop-blur-1'
      : 'bg-surface-1 border-b border-line-1';

  return (
    <header
      className={['sticky top-0 z-10 flex h-14 items-center justify-between px-s4 sm:px-s6 lg:px-s7', surface].join(' ')}
    >
      <button
        type="button"
        onClick={onTitleClick}
        aria-label="Volver al inicio"
        className="font-display text-[18px] font-semibold tracking-tight text-ink-1 transition-opacity hover:opacity-70"
      >
        Gasti
      </button>
      <ThemeToggle />
    </header>
  );
}
