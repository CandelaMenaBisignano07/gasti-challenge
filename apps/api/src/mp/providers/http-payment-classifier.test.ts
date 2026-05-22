import { test, expect, afterEach } from 'bun:test';
import { HttpPaymentClassifier } from './http-payment-classifier';
import { FALLBACK_CLASSIFICATION } from '../domain/payment-classifier';
import type { ClassifyArgs } from '../domain/payment-classifier';
import type { User } from '../../users/domain/user';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const fakeUser: User = {
  id: 'default-user',
  displayName: null,
  languagePref: null,
  mpUserId: null,
  mpAccessToken: null,
  mpRefreshToken: null,
  mpTokenExpiresAt: null,
  mpScope: null,
  mpLiveMode: null,
  mpConnectedAt: null,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};

const args: ClassifyArgs = {
  user: fakeUser,
  kind: 'expense',
  amount: 3000,
  merchant: 'Starbucks',
  description: 'Café',
  counterparty: null,
};

const jsonResponse = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 502, json: async () => body }) as Response;

test('classify returns the parsed Classification on a successful response', async () => {
  globalThis.fetch = (async () =>
    jsonResponse({
      status: 'success',
      result: { category: 'comida', suggestedDescription: 'Café en Starbucks', confidence: 0.9 },
    })) as typeof fetch;

  const result = await new HttpPaymentClassifier().classify(args);
  expect(result).toEqual({
    category: 'comida',
    suggestedDescription: 'Café en Starbucks',
    confidence: 0.9,
  });
});

test('classify falls back after the retry when the response is malformed', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    // Invalid: bad category + out-of-range confidence — fails Zod validation.
    return jsonResponse({
      status: 'success',
      result: { category: 'not-a-category', suggestedDescription: 'X', confidence: 5 },
    });
  }) as typeof fetch;

  const result = await new HttpPaymentClassifier().classify(args);
  expect(result).toEqual(FALLBACK_CLASSIFICATION('Starbucks'));
  expect(calls).toBe(2); // initial attempt + one retry
});

test('classify falls back after the retry on a non-OK HTTP response', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return jsonResponse({}, false);
  }) as typeof fetch;

  const result = await new HttpPaymentClassifier().classify(args);
  expect(result).toEqual(FALLBACK_CLASSIFICATION('Starbucks'));
  expect(calls).toBe(2);
});
