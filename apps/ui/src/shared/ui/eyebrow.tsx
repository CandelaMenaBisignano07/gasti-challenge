import type { ReactNode } from 'react';
import { Sparkle } from '@/shared/icons/sparkle';

type EyebrowProps = {
  tone?: 'ink' | 'ai';
  children: ReactNode;
  className?: string;
};

export function Eyebrow({ tone = 'ink', children, className }: EyebrowProps) {
  return (
    <div
      className={[
        'inline-flex items-center gap-s2',
        'font-display text-[10.5px] font-medium uppercase leading-none tracking-eyebrow',
        tone === 'ai' ? 'text-ai-ink' : 'text-ink-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tone === 'ai' && <Sparkle size={12} className="text-ai" />}
      <span>{children}</span>
    </div>
  );
}
