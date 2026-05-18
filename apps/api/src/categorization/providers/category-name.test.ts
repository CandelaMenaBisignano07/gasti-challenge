import { test, expect } from 'bun:test';
import { normalizeCategoryName } from './category-name';

test('normalizeCategoryName trims, lowercases and collapses whitespace', () => {
  expect(normalizeCategoryName('  Mascotas  ')).toBe('mascotas');
  expect(normalizeCategoryName('Gastos   Fijos')).toBe('gastos fijos');
});

test('normalizeCategoryName returns an empty string for blank input', () => {
  expect(normalizeCategoryName('   ')).toBe('');
});
