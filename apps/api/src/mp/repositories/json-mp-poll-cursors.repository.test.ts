import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonMpPollCursorsRepository } from './json-mp-poll-cursors.repository';

describe('JsonMpPollCursorsRepository', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mp-poll-'));
    process.env.MP_POLL_CURSORS_FILE = join(tmp, 'mp-poll-cursors.json');
  });

  afterEach(() => {
    delete process.env.MP_POLL_CURSORS_FILE;
    rmSync(tmp, { recursive: true, force: true });
  });

  test('returns null for an unseen user', async () => {
    const repo = new JsonMpPollCursorsRepository();
    expect(await repo.getByUserId('alice')).toBeNull();
  });

  test('round-trips a cursor through upsert + getByUserId', async () => {
    const repo = new JsonMpPollCursorsRepository();
    const now = new Date('2026-05-22T18:30:00.000Z');
    await repo.upsert({ userId: 'alice', lastPolledAt: now });
    const got = await repo.getByUserId('alice');
    expect(got).not.toBeNull();
    expect(got!.userId).toBe('alice');
    expect(got!.lastPolledAt.toISOString()).toBe(now.toISOString());
  });

  test('upsert overwrites an existing cursor', async () => {
    const repo = new JsonMpPollCursorsRepository();
    await repo.upsert({ userId: 'alice', lastPolledAt: new Date('2026-05-22T18:00:00.000Z') });
    await repo.upsert({ userId: 'alice', lastPolledAt: new Date('2026-05-22T19:00:00.000Z') });
    const got = await repo.getByUserId('alice');
    expect(got!.lastPolledAt.toISOString()).toBe('2026-05-22T19:00:00.000Z');
  });
});
