'use client';

export type Option = {
  id: string;
  label: string;
  intent?: 'confirm' | 'cancel';
  disabled?: boolean;
};

type OptionPillStackProps = {
  options: Option[];
  onPick: (id: string) => void;
  label?: string;
};

export function OptionPillStack({ options, onPick, label = 'Opciones' }: OptionPillStackProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-s2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={opt.disabled}
          onClick={() => onPick(opt.id)}
          className={[
            'w-full rounded-md border border-line-1 bg-surface-tint',
            'px-s4 py-s3 text-center font-display text-[14px] font-semibold text-ai-ink',
            'transition-transform duration-fast ease-out active:scale-[0.985]',
            'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
            'disabled:opacity-30 disabled:pointer-events-none',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
