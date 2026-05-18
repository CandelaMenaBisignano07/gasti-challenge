import { test, expect } from 'bun:test';
import { createTokenCipher, type EncryptedToken } from './token-cipher';

const KEY = Buffer.alloc(32, 7).toString('base64');

test('round-trips a token', () => {
  const cipher = createTokenCipher(KEY);
  const enc = cipher.encrypt('APP_USR-secret-token');
  expect(enc.ciphertext).not.toBe('APP_USR-secret-token');
  expect(cipher.decrypt(enc)).toBe('APP_USR-secret-token');
});

test('a tampered ciphertext fails to decrypt', () => {
  const cipher = createTokenCipher(KEY);
  const enc = cipher.encrypt('x');
  const tampered: EncryptedToken = { ...enc, ciphertext: Buffer.from('zzzz').toString('base64') };
  expect(() => cipher.decrypt(tampered)).toThrow();
});

test('rejects a key that is not 32 bytes', () => {
  expect(() => createTokenCipher(Buffer.alloc(16).toString('base64'))).toThrow();
});
