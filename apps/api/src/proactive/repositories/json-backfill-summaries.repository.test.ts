import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonBackfillSummariesRepository } from './json-backfill-summaries.repository';

describe('JsonBackfillSummariesRepository', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'backfill-summaries-'));
    process.env.BACKFILL_SUMMARIES_FILE = join(tmp, 'backfill-summaries.json');
  });

  afterEach(() => {
    delete process.env.BACKFILL_SUMMARIES_FILE;
    rmSync(tmp, { recursive: true, force: true });
  });

  test('round-trips a summary through create + getById', async () => {
    const repo = new JsonBackfillSummariesRepository();
    const created = await repo.create({
      userId: 'alice',
      scope: '7d',
      rangeBegin: new Date('2026-05-15T00:00:00.000Z'),
      rangeEnd: new Date('2026-05-22T00:00:00.000Z'),
      totalImported: 12,
      byOperationType: {
        regular_payment: 8,
        money_transfer: 3,
        recurring_payment: 1,
        account_fund: 0,
      },
      lowConfidenceCount: 2,
      truncated: false,
      status: 'visible',
    });

    expect(created.id).toBeString();
    expect(created.createdAt).toBeInstanceOf(Date);

    const got = await repo.getById('alice', created.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(created.id);
    expect(got!.userId).toBe('alice');
    expect(got!.scope).toBe('7d');
    expect(got!.totalImported).toBe(12);
    expect(got!.byOperationType.regular_payment).toBe(8);
    expect(got!.lowConfidenceCount).toBe(2);
    expect(got!.truncated).toBe(false);
    expect(got!.status).toBe('visible');
    expect(got!.rangeBegin.toISOString()).toBe('2026-05-15T00:00:00.000Z');
    expect(got!.rangeEnd.toISOString()).toBe('2026-05-22T00:00:00.000Z');
    expect(got!.createdAt.toISOString()).toBe(created.createdAt.toISOString());
  });

  test('markDismissed flips status to dismissed', async () => {
    const repo = new JsonBackfillSummariesRepository();
    const created = await repo.create({
      userId: 'alice',
      scope: '24h',
      rangeBegin: new Date('2026-05-21T00:00:00.000Z'),
      rangeEnd: new Date('2026-05-22T00:00:00.000Z'),
      totalImported: 3,
      byOperationType: {
        regular_payment: 3,
        money_transfer: 0,
        recurring_payment: 0,
        account_fund: 0,
      },
      lowConfidenceCount: 0,
      truncated: false,
      status: 'visible',
    });

    await repo.markDismissed(created.id);
    const got = await repo.getById('alice', created.id);
    expect(got).not.toBeNull();
    expect(got!.status).toBe('dismissed');
  });
});
