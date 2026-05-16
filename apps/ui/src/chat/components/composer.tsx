'use client';

import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Sparkle } from '@/shared/icons/sparkle';

type ComposerState = 'idle' | 'thinking' | 'disabled';

type ComposerProps = {
  onSubmit: (text: string) => void;
  state?: ComposerState;
  placeholder?: string;
};

export function Composer({
  onSubmit,
  state = 'idle',
  placeholder = 'Pregúntame lo que quieras',
}: ComposerProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (state !== 'idle') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue('');
    },
    [onSubmit, state, value],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const activePlaceholder = state === 'thinking' ? 'Buscando…' : placeholder;
  const disabled = state !== 'idle';
  const canSubmit = state === 'idle' && value.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className={[
        'flex items-center gap-s3 rounded-pill',
        'bg-surface-frost border border-line-mesh backdrop-blur-2',
        'px-s3 py-s2 shadow-3',
      ].join(' ')}
      aria-busy={state === 'thinking'}
    >
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={activePlaceholder}
        disabled={disabled}
        aria-label="Mensaje para Gasti"
        className={[
          'flex-1 resize-none bg-transparent outline-none',
          'font-display text-[15px] leading-[1.5] text-ink-1 placeholder:text-ink-4',
          'max-h-32 py-s1',
        ].join(' ')}
      />
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label="Enviar"
        className={[
          'flex h-9 w-9 items-center justify-center rounded-pill',
          'text-white shadow-brand-glow [background:var(--brand-grad)]',
          'transition-transform duration-fast ease-out active:scale-[0.985]',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
          'disabled:opacity-30',
        ].join(' ')}
      >
        <Sparkle size={18} className={state === 'thinking' ? 'animate-pulse' : ''} />
      </button>
    </form>
  );
}
