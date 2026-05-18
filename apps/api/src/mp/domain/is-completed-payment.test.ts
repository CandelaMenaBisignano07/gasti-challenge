import { test, expect } from 'bun:test';
import { isCompletedPayment } from './is-completed-payment';

const base = { status_detail: 'accredited', captured: true } as const;

test('approved + accredited + captured is completed', () => {
  expect(isCompletedPayment({ ...base, status: 'approved' } as any)).toBe(true);
});

test('pending is not completed', () => {
  expect(isCompletedPayment({ ...base, status: 'pending' } as any)).toBe(false);
});

test('approved but not captured is not completed', () => {
  expect(isCompletedPayment({ ...base, status: 'approved', captured: false } as any)).toBe(false);
});
