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
