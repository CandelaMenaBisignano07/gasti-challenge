import { test, expect, afterAll } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { createTokenCipher } from '../../shared/security/token-cipher';
import type { MpLinkFields } from '../domain/users.repository';

// Point the repository's JSON store at a throwaway temp file. paths.ts reads
// USERS_FILE at module-eval time, so this must be set before the repo is
// imported — hence the dynamic import() inside each test.
const TMP_USERS = join(tmpdir(), `gasti-users-${process.pid}-${Date.now()}.json`);
process.env.USERS_FILE = TMP_USERS;

const KEY = Buffer.alloc(32, 9).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 1).toString('base64');

const link: MpLinkFields = {
  mpUserId: '12345',
  mpAccessToken: 'APP_USR-access-token',
  mpRefreshToken: 'TG-refresh-token',
  mpTokenExpiresAt: new Date('2026-06-01T00:00:00.000Z'),
  mpScope: 'read write',
  mpLiveMode: true,
  mpConnectedAt: new Date('2026-05-18T00:00:00.000Z'),
};

afterAll(() => {
  if (existsSync(TMP_USERS)) rmSync(TMP_USERS);
});

test('round-trips MP tokens through encryption at rest', async () => {
  const { JsonUsersRepository } = await import('./json-users.repository');
  const repo = new JsonUsersRepository(createTokenCipher(KEY));

  await repo.linkMpAccount('default-user', link);
  const user = await repo.getCurrent();

  expect(user.mpUserId).toBe('12345');
  expect(user.mpAccessToken).toBe('APP_USR-access-token');
  expect(user.mpRefreshToken).toBe('TG-refresh-token');
  expect(user.mpTokenExpiresAt?.toISOString()).toBe('2026-06-01T00:00:00.000Z');

  // The plaintext tokens must never appear on disk.
  const onDisk = await Bun.file(TMP_USERS).text();
  expect(onDisk).not.toContain('APP_USR-access-token');
  expect(onDisk).not.toContain('TG-refresh-token');
});

test('a token that fails to decrypt reads back as null — user treated as disconnected', async () => {
  const { JsonUsersRepository } = await import('./json-users.repository');

  // Persist tokens encrypted under OTHER_KEY...
  const writer = new JsonUsersRepository(createTokenCipher(OTHER_KEY));
  await writer.linkMpAccount('default-user', link);

  // ...then read them back with the wrong key.
  const reader = new JsonUsersRepository(createTokenCipher(KEY));
  const user = await reader.getCurrent();

  expect(user.mpUserId).toBe('12345');        // non-secret fields still resolve
  expect(user.mpAccessToken).toBeNull();      // undecryptable token degrades to null
  expect(user.mpRefreshToken).toBeNull();
});

test('findByMpUserId resolves a linked account', async () => {
  const { JsonUsersRepository } = await import('./json-users.repository');
  const repo = new JsonUsersRepository(createTokenCipher(KEY));

  await repo.linkMpAccount('default-user', link);

  expect((await repo.findByMpUserId('12345'))?.id).toBe('default-user');
  expect(await repo.findByMpUserId('99999')).toBeNull();
});

test('unlinkMpAccount clears every MP field', async () => {
  const { JsonUsersRepository } = await import('./json-users.repository');
  const repo = new JsonUsersRepository(createTokenCipher(KEY));

  await repo.linkMpAccount('default-user', link);
  await repo.unlinkMpAccount('default-user');
  const user = await repo.getCurrent();

  expect(user.mpUserId).toBeNull();
  expect(user.mpAccessToken).toBeNull();
  expect(user.mpRefreshToken).toBeNull();
  expect(user.mpConnectedAt).toBeNull();
});
