'use client';
import { useState, useEffect, useRef } from 'react';

const MAX = 240;

export interface CategoryDescriptionEditorProps {
  initial: string;
  canReset: boolean;
  onSave: (description: string) => Promise<void>;
  onReset: () => Promise<void>;
  onCancel: () => void;
}

export function CategoryDescriptionEditor(props: CategoryDescriptionEditorProps) {
  const [value, setValue] = useState(props.initial);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  async function save() {
    if (value.length > MAX || saving) return;
    setSaving(true);
    try {
      await props.onSave(value);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void save();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onCancel();
    }
  }

  if (confirmReset) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[13px] text-ink-2">¿Volver al texto original?</span>
        <button
          onClick={() => void props.onReset()}
          className="px-3 h-8 rounded-pill bg-ai-soft text-ai-ink text-[13px]"
        >
          Sí
        </button>
        <button
          onClick={() => setConfirmReset(false)}
          className="px-3 h-8 rounded-pill text-[13px] text-ink-3 hover:bg-surface-3"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="rounded-md border border-line-2 bg-surface-0 px-3.5 py-3">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          aria-label="Descripción de la categoría"
          className="w-full resize-y min-h-[60px] max-h-[200px] bg-transparent text-[14px] text-ink-1 outline-none focus:outline-2 focus:outline-ai"
        />
      </div>
      <div
        className={`mt-1 text-right text-[11px] uppercase tracking-label ${
          value.length > MAX ? 'text-neg' : 'text-ink-3'
        }`}
        aria-live="polite"
      >
        {value.length} / {MAX}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {props.canReset && (
          <button
            onClick={() => setConfirmReset(true)}
            className="px-3 h-9 rounded-pill text-[13px] text-ai-ink hover:bg-ai-soft"
          >
            Volver al default
          </button>
        )}
        <button
          onClick={props.onCancel}
          className="px-3 h-9 rounded-pill text-[13px] text-ink-2 hover:bg-surface-3"
        >
          Cancelar
        </button>
        <button
          onClick={() => void save()}
          disabled={value.length > MAX || saving}
          className="px-4 h-9 rounded-pill bg-gradient-to-b from-[#6E61FF] to-[#4338CA] text-white text-[13px] font-semibold shadow-[0_10px_30px_-10px_rgba(79,70,229,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-40"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
