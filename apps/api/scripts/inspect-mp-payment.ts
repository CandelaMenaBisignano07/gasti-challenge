/**
 * One-off debug: prints the raw MP /v1/payments/{id} response so we can see
 * what the payer block actually contains for a given payment. Not wired into
 * the app; run with `bun run apps/api/scripts/inspect-mp-payment.ts <id>`.
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
  const paymentId = process.argv[2];
  if (!paymentId) {
    console.error('usage: bun run apps/api/scripts/inspect-mp-payment.ts <paymentId>');
    process.exit(1);
  }

  const env = loadEnv();
  const cipher = createTokenCipher(env.TOKEN_ENCRYPTION_KEY);
  const users = JSON.parse(readFileSync(join(import.meta.dir, '..', 'data', 'users.json'), 'utf8'));
  const u = users[0];
  if (!u?.mpAccessTokenEnc) {
    console.error('no MP access token stored — user is not connected');
    process.exit(1);
  }
  const accessToken = cipher.decrypt(u.mpAccessTokenEnc);

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  console.log(`HTTP ${res.status}`);
  const body = await res.json();
  console.log('--- payer block ---');
  console.log(JSON.stringify(body.payer, null, 2));
  console.log('--- collector block (for outgoing) ---');
  console.log(JSON.stringify(body.collector, null, 2));
  console.log('--- payer_id (for outgoing) ---');
  console.log(JSON.stringify(body.payer_id, null, 2));
  console.log('--- top-level keys ---');
  console.log(Object.keys(body).sort().join(', '));
  console.log('--- selected fields ---');
  console.log(JSON.stringify({
    id: body.id,
    operation_type: body.operation_type,
    transaction_amount: body.transaction_amount,
    description: body.description,
    payment_method_id: body.payment_method_id,
    payment_type_id: body.payment_type_id,
    collector_id: body.collector_id,
    money_release_status: body.money_release_status,
    additional_info: body.additional_info,
  }, null, 2));
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
