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
  caption?: string;
  selectedId?: string;
};

export function OptionPillStack({
  options,
  onPick,
  label = 'Opciones',
  caption,
  selectedId,
}: OptionPillStackProps) {
  return (
    <div className="flex flex-col gap-s2">
      {caption && (
        <p className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {caption}
        </p>
      )}
      <div role="group" aria-label={label} className="flex flex-col gap-s2">
        {options.map((opt) => {
          const selected = selectedId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              aria-pressed={selected}
              onClick={() => onPick(opt.id)}
              style={{
                transition:
                  'transform var(--dur-fast) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
              }}
              className={[
                'w-full rounded-md border',
                selected
                  ? 'border-ai bg-ai/10 text-ai-ink'
                  : 'border-line-1 bg-surface-tint text-ai-ink',
                'px-s4 py-s3 text-center font-display text-[14px] font-semibold',
                'active:scale-[0.985]',
                'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
                'disabled:opacity-30 disabled:pointer-events-none',
              ].join(' ')}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
