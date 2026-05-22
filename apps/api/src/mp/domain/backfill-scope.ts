import { z } from 'zod';

export const backfillScopeSchema = z.enum(['24h', '7d', '15d', '30d']);
export type BackfillScope = z.infer<typeof backfillScopeSchema>;

export const BACKFILL_SCOPES: readonly BackfillScope[] = ['24h', '7d', '15d', '30d'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function backfillScopeDurationMs(scope: BackfillScope): number {
  switch (scope) {
    case '24h': return 24 * HOUR_MS;
    case '7d':  return 7  * DAY_MS;
    case '15d': return 15 * DAY_MS;
    case '30d': return 30 * DAY_MS;
  }
}
