/**
 * Probe MP's /users/{id} endpoint to see what's publicly readable about a
 * recipient when our only handle is their numeric collector_id.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTokenCipher } from '../src/shared/security/token-cipher';

function loadEnv(): Record<string, string> {
  const envPath = join(import.meta.dir, '..', '.env');
  const out: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('usage: bun run apps/api/scripts/inspect-mp-user.ts <userId>');
    process.exit(1);
  }
  const env = loadEnv();
  const cipher = createTokenCipher(env.TOKEN_ENCRYPTION_KEY);
  const users = JSON.parse(readFileSync(join(import.meta.dir, '..', 'data', 'users.json'), 'utf8'));
  const accessToken = cipher.decrypt(users[0].mpAccessTokenEnc);

  for (const url of [
    `https://api.mercadopago.com/users/${userId}`,
    `https://api.mercadopago.com/users/${userId}/profile`,
  ]) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    console.log(`\n${url}  →  HTTP ${res.status}`);
    const text = await res.text();
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text.slice(0, 400));
    }
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
