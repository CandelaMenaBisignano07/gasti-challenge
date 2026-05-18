import { test, expect } from 'bun:test';
import { OverrideMerchantCategory } from './override-merchant.use-case';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import { fakeCategoriesRepo, fakeCategorizationRepo } from '../../shared/testing/fakes';

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('override-merchant persists the rule', async () => {
  const repo = fakeCategorizationRepo();
  const result = await new OverrideMerchantCategory(repo, registry()).execute({
    merchant: 'Coderhouse',
    category: 'educacion',
  });
  expect(result).toEqual({ merchant: 'Coderhouse', category: 'educacion' });
  expect((await repo.overrides()).merchants.Coderhouse).toBe('educacion');
});

test('override-merchant accepts a custom category', async () => {
  const repo = fakeCategorizationRepo();
  await new OverrideMerchantCategory(repo, registry()).execute({
    merchant: 'Pet Shop',
    category: 'mascotas',
  });
  expect((await repo.overrides()).merchants['Pet Shop']).toBe('mascotas');
});

test('override-merchant rejects an unknown category', async () => {
  const useCase = new OverrideMerchantCategory(fakeCategorizationRepo(), registry());
  await expect(
    useCase.execute({ merchant: 'X', category: 'inventada' }),
  ).rejects.toThrow(DomainError);
});
