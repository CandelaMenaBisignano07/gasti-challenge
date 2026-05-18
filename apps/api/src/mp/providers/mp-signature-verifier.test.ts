import { test, expect } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createMpSignatureVerifier } from './mp-signature-verifier';

const SECRET = 'whsec_test';
function sign(dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', SECRET).update(manifest).digest('hex');
}

test('accepts a correctly signed webhook', () => {
  const verify = createMpSignatureVerifier(SECRET);
  const v1 = sign('PAY_1', 'req_1', '1747200000');
  expect(verify({ xSignature: `ts=1747200000,v1=${v1}`, xRequestId: 'req_1', dataId: 'PAY_1' })).toBe(true);
});

test('rejects a tampered signature', () => {
  const verify = createMpSignatureVerifier(SECRET);
  expect(verify({ xSignature: 'ts=1747200000,v1=deadbeef', xRequestId: 'req_1', dataId: 'PAY_1' })).toBe(false);
});

test('rejects a malformed header', () => {
  const verify = createMpSignatureVerifier(SECRET);
  expect(verify({ xSignature: 'garbage', xRequestId: 'req_1', dataId: 'PAY_1' })).toBe(false);
});
