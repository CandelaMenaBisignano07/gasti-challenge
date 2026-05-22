'use client';
import { useState } from 'react';
import type { CategoryWithDescription } from '../domain/category-with-description';
import { CategoryDescriptionEditor } from './category-description-editor';

export interface CategoryDescriptionCardProps {
  category: CategoryWithDescription;
  /** Seed description for defaults — used to compute whether a reset is meaningful. */
  seedDescription?: string;
  onSave: (description: string) => Promise<void>;
  onReset: () => Promise<void>;
}

export function CategoryDescriptionCard(props: CategoryDescriptionCardProps) {
  const [editing, setEditing] = useState(false);
  const { category, seedDescription } = props;
  const isDefault = !category.isCustom;
  const hasOverride =
    isDefault && seedDescription !== undefined && category.description !== seedDescription;

  return (
    <li
      className="rounded-[20px] border border-line-1 bg-surface-tint px-5 py-4"
      aria-labelledby={`cat-${category.name}`}
    >
      <header className="flex items-center justify-between">
        <h2
          id={`cat-${category.name}`}
          className="text-[16px] font-semibold text-ink-1 capitalize"
        >
          {category.name}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-label text-ink-3">
            {category.isCustom ? 'Custom' : 'Default'}
          </span>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-[13px] text-ai-ink hover:underline"
            >
              Editar
            </button>
          )}
        </div>
      </header>
      {!editing && (
        <p
          className={`mt-2 text-[14px] ${
            category.description ? 'text-ink-2' : 'italic text-ink-4'
          }`}
        >
          {category.description || 'Sin descripción.'}
        </p>
      )}
      {editing && (
        <CategoryDescriptionEditor
          initial={category.description}
          canReset={!!hasOverride}
          onCancel={() => setEditing(false)}
          onSave={async (d) => {
            await props.onSave(d);
            setEditing(false);
          }}
          onReset={async () => {
            await props.onReset();
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}
