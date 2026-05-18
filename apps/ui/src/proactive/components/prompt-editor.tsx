'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { CategoryIcon } from '@/shared/icons/category-icon';
import type { Category } from '@/shared/theme/tokens';

const CATEGORIES: Category[] = [
  'comida',
  'transporte',
  'entretenimiento',
  'salud',
  'servicios',
  'educacion',
  'otros',
];

function label(category: Category): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export type PromptEditorValue = {
  category: string;
  description: string;
  rememberMerchantCategory: boolean;
};

type PromptEditorProps = {
  initialCategory: string;
  initialDescription: string;
  merchant: string | null;
  onConfirm: (value: PromptEditorValue) => void;
};

export function PromptEditor({
  initialCategory,
  initialDescription,
  merchant,
  onConfirm,
}: PromptEditorProps) {
  const [category, setCategory] = useState(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [remember, setRemember] = useState(false);

  return (
    <div className="mt-s3 flex flex-col gap-s3">
      <div className="flex flex-col gap-s2">
        <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
          Categoría
        </span>
        <div className="flex flex-wrap gap-s2" role="group" aria-label="Categoría">
          {CATEGORIES.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                className={[
                  'inline-flex items-center gap-s2 rounded-pill border px-s3 py-[6px]',
                  'font-display text-[12px] font-medium tracking-label',
                  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
                  active
                    ? 'border-line-1 bg-surface-tint text-ai-ink'
                    : 'border-line-1 bg-surface-0 text-ink-3',
                ].join(' ')}
              >
                <CategoryIcon category={c} size={14} />
                {label(c)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-s2">
        <label
          htmlFor="prompt-editor-description"
          className="font-display text-[12px] font-medium tracking-label text-ink-3"
        >
          Descripción
        </label>
        <input
          id="prompt-editor-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={[
            'w-full rounded-md border border-line-1 bg-surface-0',
            'px-s3 py-s2 font-display text-[14px] text-ink-1',
            'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
          ].join(' ')}
        />
      </div>

      {merchant && (
        <label className="flex items-center gap-s2 font-display text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded-xs border-line-1 accent-ai"
          />
          Recordar {merchant} como {label(category as Category)}
        </label>
      )}

      <Button
        variant="primary"
        size="sm"
        className="self-start"
        onClick={() =>
          onConfirm({ category, description, rememberMerchantCategory: remember })
        }
      >
        Guardar
      </Button>
    </div>
  );
}
