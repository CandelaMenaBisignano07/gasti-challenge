import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedToken {
  readonly ciphertext: string; // base64
  readonly iv: string;         // base64
  readonly tag: string;        // base64
}

export interface TokenCipher {
  encrypt(plaintext: string): EncryptedToken;
  decrypt(token: EncryptedToken): string;
}

/** AES-256-GCM cipher. `keyBase64` must decode to exactly 32 bytes. */
export function createTokenCipher(keyBase64: string): TokenCipher {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  }
  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
      };
    },
    decrypt(token) {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(token.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(token.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(token.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
