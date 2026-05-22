import { z } from 'zod';

export const operationTypeSchema = z.enum([
  'regular_payment',
  'money_transfer',
  'recurring_payment',
  'account_fund',
]);

export type OperationType = z.infer<typeof operationTypeSchema>;

/**
 * `account_fund` is "user funded their MP wallet from their bank" — not a real
 * expense nor income, just an internal transfer. We never surface these.
 *
 * Unknown / missing values are treated as `regular_payment` (the most common).
 */
export const ACCEPTED_OPERATION_TYPES: ReadonlySet<OperationType> = new Set([
  'regular_payment',
  'money_transfer',
  'recurring_payment',
]);

export function isAcceptedOperationType(value: string | null | undefined): value is OperationType {
  return value != null && ACCEPTED_OPERATION_TYPES.has(value as OperationType);
}
