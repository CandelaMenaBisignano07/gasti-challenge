import { test, expect } from 'bun:test';
import { MpWebhookController } from './mp-webhook.controller';
import type { MpWebhookBody } from './mp.schemas';
import type { MpSignatureVerifier } from '../providers/mp-signature-verifier';
import type { ProcessMpEvent } from '../use-cases/process-mp-event.use-case';

const paymentBody = (type = 'payment'): MpWebhookBody => ({
  type,
  action: 'payment.created',
  data: { id: 'pay_123' },
});

// The controller fires ProcessMpEvent and forgets it; a no-op stub is enough.
const noopProcess = { execute: async () => {} } as unknown as ProcessMpEvent;

const headers = { xSignature: 'ts=1,v1=abc', xRequestId: 'req-1' };

test('a signature mismatch returns the 200 envelope and consults the verifier', () => {
  let consulted = false;
  const verify: MpSignatureVerifier = () => {
    consulted = true;
    return false;
  };
  const controller = new MpWebhookController(verify, noopProcess);

  const result = controller.handle(headers.xSignature, headers.xRequestId, paymentBody());
  expect(result).toEqual({ received: true });
  expect(consulted).toBe(true);
});

test('a non-payment body returns the 200 envelope', () => {
  const verify: MpSignatureVerifier = () => true;
  const controller = new MpWebhookController(verify, noopProcess);

  const result = controller.handle(headers.xSignature, headers.xRequestId, paymentBody('merchant_order'));
  expect(result).toEqual({ received: true });
});

test('a valid payment body returns the 200 envelope', () => {
  const verify: MpSignatureVerifier = () => true;
  const controller = new MpWebhookController(verify, noopProcess);

  const result = controller.handle(headers.xSignature, headers.xRequestId, paymentBody());
  expect(result).toEqual({ received: true });
});
