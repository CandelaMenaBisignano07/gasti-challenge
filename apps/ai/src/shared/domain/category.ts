import { z } from 'zod';

export interface CategoryDefinition {
  readonly name: string;
  readonly description: string;
}

/** The seven built-in categories with seed descriptions. Custom categories arrive at runtime. */
export const DEFAULT_CATEGORIES: readonly CategoryDefinition[] = [
  { name: 'comida',          description: 'Restaurantes, delivery, supermercados, almacenes, kioscos, cafés.' },
  { name: 'transporte',      description: 'Uber, Cabify, taxi, colectivo, subte, SUBE, combustible, peajes, estacionamiento.' },
  { name: 'entretenimiento', description: 'Streaming (Netflix, Spotify), juegos, cine, bares, salidas, eventos.' },
  { name: 'salud',           description: 'Farmacia, médicos, obra social, prepaga, gimnasio, terapia.' },
  { name: 'servicios',       description: 'Luz, gas, agua, internet, telefonía, expensas, suscripciones funcionales (Drive, iCloud).' },
  { name: 'educacion',       description: 'Cursos, colegiatura, universidad, libros, capacitaciones, idiomas.' },
  { name: 'otros',           description: 'Catch-all explícito cuando el usuario lo elige. Nunca es una caída silenciosa.' },
];

export const DEFAULT_CATEGORY_NAMES: readonly string[] = DEFAULT_CATEGORIES.map((c) => c.name);

/** A category name. Validity against the registry is checked server-side. */
export const categorySchema = z.string().min(1);
export type Category = z.infer<typeof categorySchema>;
