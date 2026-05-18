import { z } from 'zod';

export const categorySchema = z.enum([
  'comida',
  'transporte',
  'entretenimiento',
  'salud',
  'servicios',
  'educacion',
  'otros',
]);

export type Category = z.infer<typeof categorySchema>;

export const DISCRETIONARY_CATEGORIES: readonly Category[] = ['entretenimiento', 'otros'];

export function isDiscretionary(category: Category): boolean {
  return DISCRETIONARY_CATEGORIES.includes(category);
}
