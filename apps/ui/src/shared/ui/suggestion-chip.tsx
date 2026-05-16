'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

type SuggestionChipProps = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
};

export function SuggestionChip({ icon: Icon, label, onClick }: SuggestionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex w-full items-center gap-s3',
        'rounded-md border border-line-1 bg-surface-tint',
        'px-s4 py-s3 text-left',
        'shadow-2 transition-shadow duration-base ease-out hover:shadow-3',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
      ].join(' ')}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-ai-soft text-ai-ink">
        <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="flex-1 font-display text-[15px] font-medium text-ink-1">{label}</span>
      <ChevronRight size={16} strokeWidth={1.5} className="text-ink-3" aria-hidden="true" />
    </button>
  );
}
