import { describe, expect, test } from 'bun:test';
import { backfillScopeDurationMs, BACKFILL_SCOPES, type BackfillScope } from './backfill-scope';

describe('backfillScopeDurationMs', () => {
  test('returns correct durations', () => {
    expect(backfillScopeDurationMs('24h')).toBe(24 * 60 * 60 * 1000);
    expect(backfillScopeDurationMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(backfillScopeDurationMs('15d')).toBe(15 * 24 * 60 * 60 * 1000);
    expect(backfillScopeDurationMs('30d')).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test('BACKFILL_SCOPES enumerates exactly the four supported scopes', () => {
    const scopes: BackfillScope[] = [...BACKFILL_SCOPES];
    expect(scopes).toEqual(['24h', '7d', '15d', '30d']);
  });
});
