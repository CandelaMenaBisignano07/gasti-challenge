import { z } from 'zod';
import { periodSchema } from '../../shared/domain/period';

export const declareIncomeInput = z.object({
  kind: z.enum(['recurring', 'oneOff']),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});

export const cashFlowInput = z.object({ period: periodSchema });
