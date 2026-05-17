import { test, expect } from 'bun:test';
import { OverrideMerchantCategory } from './override-merchant.use-case';
import { fakeCategorizationRepo } from '../../shared/testing/fakes';

test('override-merchant persists the rule', async () => {
  const repo = fakeCategorizationRepo();
  const result = await new OverrideMerchantCategory(repo).execute({
    merchant: 'Coderhouse',
    category: 'educacion',
  });
  expect(result).toEqual({ merchant: 'Coderhouse', category: 'educacion' });
  expect((await repo.overrides()).merchants.Coderhouse).toBe('educacion');
});
