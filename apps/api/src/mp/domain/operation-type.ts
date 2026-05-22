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

/**
 * Spec intent: accept every operation type except `account_fund` (internal
 * wallet top-ups, never a real expense or income). Missing/unknown values are
 * accepted defensively — see the docstring on `ACCEPTED_OPERATION_TYPES` above.
 */
export function isAcceptedOperationType(value: string | null | undefined): boolean {
  return value !== 'account_fund';
}

/**
 * Coerces unknown / missing / `account_fund` values to `regular_payment` — the
 * most common — so downstream code (transactions, breakdowns, prompt copy) can
 * trust the value belongs to the canonical three-element user-facing set.
 *
 * `account_fund` is normally filtered upstream by `isAcceptedOperationType`,
 * but coercing here keeps the function total in case a caller forgets.
 */
export function normalizeOperationType(
  value: string | null | undefined,
): Exclude<OperationType, 'account_fund'> {
  if (value === 'money_transfer' || value === 'recurring_payment') return value;
  return 'regular_payment';
}
