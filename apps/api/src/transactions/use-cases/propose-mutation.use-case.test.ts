import { test, expect } from 'bun:test';
import { ProposeTransactionMutation } from './propose-mutation.use-case';
import { PeriodResolver } from '../../shared/providers/period-resolver';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { fakeCategorizationRepo, fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { Transaction } from '../../shared/domain/transaction';

const tx = (id: string, merchant: string, date: string): Transaction => ({
  id,
  date,
  amount: 1000,
  currency: 'ARS',
  category: 'comida',
  description: '',
  merchant,
});

function build(seed: Transaction[]) {
  return new ProposeTransactionMutation(
    fakeTransactionsRepo(seed),
    new PeriodResolver(fixedClock('2026-05-17')),
    new CategoryResolver(fakeCategorizationRepo()),
  );
}

test('propose resolves matches by merchant', async () => {
  const useCase = build([tx('txn_001', 'Rappi', '2026-05-10'), tx('txn_002', 'Uber', '2026-05-10')]);
  const result = await useCase.execute({ intent: 'delete', selector: { merchant: 'rappi' } });
  expect(result.intent).toBe('delete');
  expect(result.matches.map((m) => m.id)).toEqual(['txn_001']);
});

test('propose returns an empty array when nothing matches', async () => {
  const useCase = build([tx('txn_001', 'Rappi', '2026-05-10')]);
  const result = await useCase.execute({ intent: 'delete', selector: { merchant: 'Nope' } });
  expect(result.matches).toEqual([]);
});
