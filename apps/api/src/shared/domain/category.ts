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

/**
 * A category name. This schema only checks shape (a non-empty string).
 * Whether the name is a *known* category (default or custom) is a runtime
 * check done by `CategoryRegistry` inside use-cases.
 */
export const categorySchema = z.string().min(1);

export type Category = z.infer<typeof categorySchema>;

export const DISCRETIONARY_CATEGORIES: readonly string[] = ['entretenimiento', 'otros'];

export function isDiscretionary(category: string): boolean {
  return DISCRETIONARY_CATEGORIES.includes(category);
}
