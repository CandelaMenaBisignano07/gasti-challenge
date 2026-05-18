import { test, expect } from 'bun:test';
import { ProposeCategoryChange } from './propose-category-change.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { DomainError } from '../../shared/domain/domain-error';
import {
  fakeCategoriesRepo,
  fakeCategorizationRepo,
  fakeTransactionsRepo,
} from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';
import type { CategoryOverrides } from '../../shared/domain/category-overrides';

const tx = (id: string, category: string, merchant = 'Coto'): Transaction => ({
  id,
  date: '2026-05-01',
  amount: 1000,
  currency: 'ARS',
  category,
  description: '',
  merchant,
});

function build(opts: {
  categories?: string[];
  txs?: Transaction[];
  overrides?: Partial<CategoryOverrides>;
}) {
  const categories = fakeCategoriesRepo(opts.categories ?? []);
  const catRepo = fakeCategorizationRepo(opts.overrides);
  return new ProposeCategoryChange(
    fakeTransactionsRepo(opts.txs ?? []),
    new CategoryResolver(catRepo),
    new CategoryRegistry(categories),
  );
}

test('delete proposal counts transactions whose base category matches', async () => {
  const useCase = build({
    categories: ['mascotas'],
    txs: [tx('txn_001', 'mascotas'), tx('txn_002', 'mascotas'), tx('txn_003', 'comida')],
  });
  const result = await useCase.execute({ intent: 'delete', name: 'Mascotas' });
  expect(result).toEqual({ intent: 'delete', name: 'mascotas', affectedTransactionCount: 2 });
});

test('delete proposal counts transactions pulled in by an override', async () => {
  const useCase = build({
    categories: ['mascotas'],
    txs: [tx('txn_001', 'comida', 'Pet Shop'), tx('txn_002', 'comida', 'Coto')],
    overrides: { merchants: { 'Pet Shop': 'mascotas' }, transactions: { txn_002: 'mascotas' } },
  });
  const result = await useCase.execute({ intent: 'delete', name: 'mascotas' });
  expect(result.affectedTransactionCount).toBe(2);
});

test('delete proposal returns 0 for an empty custom category', async () => {
  const useCase = build({ categories: ['mascotas'], txs: [tx('txn_001', 'comida')] });
  const result = await useCase.execute({ intent: 'delete', name: 'mascotas' });
  expect(result.affectedTransactionCount).toBe(0);
});

test('delete proposal rejects a default category', async () => {
  const useCase = build({});
  await expect(useCase.execute({ intent: 'delete', name: 'comida' })).rejects.toThrow(DomainError);
});

test('delete proposal rejects an unknown category', async () => {
  const useCase = build({});
  await expect(
    useCase.execute({ intent: 'delete', name: 'inexistente' }),
  ).rejects.toThrow(DomainError);
});

test('rename proposal returns intent, names and count', async () => {
  const useCase = build({
    categories: ['mascotas'],
    txs: [tx('txn_001', 'mascotas')],
  });
  const result = await useCase.execute({ intent: 'rename', name: 'Mascotas', newName: 'Animales' });
  expect(result).toEqual({
    intent: 'rename',
    name: 'mascotas',
    newName: 'animales',
    affectedTransactionCount: 1,
  });
});

test('rename proposal rejects a target that already exists', async () => {
  const useCase = build({ categories: ['mascotas', 'viajes'] });
  await expect(
    useCase.execute({ intent: 'rename', name: 'mascotas', newName: 'Viajes' }),
  ).rejects.toThrow(DomainError);
});

test('rename proposal rejects a target longer than 24 characters', async () => {
  const useCase = build({ categories: ['mascotas'] });
  await expect(
    useCase.execute({ intent: 'rename', name: 'mascotas', newName: 'x'.repeat(25) }),
  ).rejects.toThrow(DomainError);
});

test('rename proposal allows renaming to the same normalized name', async () => {
  const useCase = build({ categories: ['mascotas'] });
  const result = await useCase.execute({ intent: 'rename', name: 'mascotas', newName: 'Mascotas' });
  expect(result).toEqual({
    intent: 'rename',
    name: 'mascotas',
    newName: 'mascotas',
    affectedTransactionCount: 0,
  });
});

test('rename proposal rejects a missing new name', async () => {
  const useCase = build({ categories: ['mascotas'] });
  await expect(
    useCase.execute({ intent: 'rename', name: 'mascotas' }),
  ).rejects.toThrow(DomainError);
});
