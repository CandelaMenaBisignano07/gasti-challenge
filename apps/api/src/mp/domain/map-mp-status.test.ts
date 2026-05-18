import { test, expect } from 'bun:test';
import { mapMpStatusToTransactionStatus } from './map-mp-status';

test('refunded maps to refunded', () => {
  expect(mapMpStatusToTransactionStatus('refunded')).toBe('refunded');
});

test('charged_back maps to charged_back', () => {
  expect(mapMpStatusToTransactionStatus('charged_back')).toBe('charged_back');
});

test('approved maps to active', () => {
  expect(mapMpStatusToTransactionStatus('approved')).toBe('active');
});
