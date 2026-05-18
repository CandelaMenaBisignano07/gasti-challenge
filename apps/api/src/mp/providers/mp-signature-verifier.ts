import { createHmac, timingSafeEqual } from 'node:crypto';

/** DI token for the configured Mercado Pago webhook signature verifier. */
export const MP_SIGNATURE_VERIFIER = 'MP_SIGNATURE_VERIFIER';

export interface SignatureInput {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string;
}
export type MpSignatureVerifier = (input: SignatureInput) => boolean;

/**
 * Verifies a Mercado Pago webhook signature: an HMAC-SHA256 over the manifest
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, keyed by the webhook secret,
 * compared against the `v1=` part of the `x-signature` header.
 */
export function createMpSignatureVerifier(secret: string): MpSignatureVerifier {
  return ({ xSignature, xRequestId, dataId }) => {
    if (!xSignature || !xRequestId) return false;
    const parts = Object.fromEntries(
      xSignature.split(',').map((p) => p.split('=').map((s) => s.trim()) as [string, string]),
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(v1, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  };
}
