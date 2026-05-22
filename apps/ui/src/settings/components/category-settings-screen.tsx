'use client';
import { useEffect, useState, useCallback } from 'react';
import type { CategoryWithDescription } from '../domain/category-with-description';
import { loadCategoriesWithDescriptions } from '../use-cases/load-categories-with-descriptions';
import { updateCategoryDescription } from '../use-cases/update-category-description';
import { resetCategoryDescription } from '../use-cases/reset-category-description';
import { CategoryDescriptionCard } from './category-description-card';

// Hardcoded seed descriptions for diffing — kept in sync with apps/api/src/shared/domain/category.ts.
// Used only to compute whether a Reset button makes sense (UI hint, not authoritative).
const SEEDS: Record<string, string> = {
  comida: 'Restaurantes, delivery, supermercados, almacenes, kioscos, cafés.',
  transporte: 'Uber, Cabify, taxi, colectivo, subte, SUBE, combustible, peajes, estacionamiento.',
  entretenimiento: 'Streaming (Netflix, Spotify), juegos, cine, bares, salidas, eventos.',
  salud: 'Farmacia, médicos, obra social, prepaga, gimnasio, terapia.',
  servicios: 'Luz, gas, agua, internet, telefonía, expensas, suscripciones funcionales (Drive, iCloud).',
  educacion: 'Cursos, colegiatura, universidad, libros, capacitaciones, idiomas.',
  otros: 'Catch-all explícito cuando el usuario lo elige. Nunca es una caída silenciosa.',
};

export function CategorySettingsScreen() {
  const [categories, setCategories] = useState<CategoryWithDescription[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setCategories(await loadCategoriesWithDescriptions());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) {
    return (
      <main className="mx-auto max-w-[720px] px-5 py-8">
        <p className="text-[14px] text-ink-2">No pudimos cargar las categorías.</p>
        <button
          onClick={() => void reload()}
          className="mt-3 px-3 h-9 rounded-pill text-[13px] text-ai-ink hover:bg-ai-soft"
        >
          Reintentar
        </button>
      </main>
    );
  }

  if (categories === null) {
    return (
      <main className="mx-auto max-w-[720px] px-5 py-8">
        <p className="text-[14px] text-ink-3">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-5 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-semibold text-ink-1 tracking-tight">
          Categorías
        </h1>
        <p className="mt-2 text-[14px] text-ink-2">
          Describí qué incluís en cada categoría. Gasti las usa para clasificar transacciones nuevas.
        </p>
      </header>
      <ul className="space-y-3">
        {categories.map((c) => (
          <CategoryDescriptionCard
            key={c.name}
            category={c}
            seedDescription={SEEDS[c.name]}
            onSave={async (d) => {
              await updateCategoryDescription(c.name, d);
              await reload();
            }}
            onReset={async () => {
              await resetCategoryDescription(c.name);
              await reload();
            }}
          />
        ))}
      </ul>
    </main>
  );
}
