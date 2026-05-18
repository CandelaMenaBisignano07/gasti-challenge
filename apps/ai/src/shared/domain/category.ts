import { z } from 'zod';

/** The seven built-in categories. Custom categories are added on top at runtime. */
export const DEFAULT_CATEGORIES = [
  'comida',
  'transporte',
  'entretenimiento',
  'salud',
  'servicios',
  'educacion',
  'otros',
] as const;

/** A category name. Validity against the registry is checked server-side. */
export const categorySchema = z.string().min(1);

export type Category = z.infer<typeof categorySchema>;
