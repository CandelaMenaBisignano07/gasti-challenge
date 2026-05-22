import { test, expect } from 'bun:test';
import { AddTransaction } from './add.use-case';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { DomainError } from '../../shared/domain/domain-error';
import {
  fakeCategoriesRepo,
  fakeCategorizationRepo,
  fakeTransactionClassifier,
  fakeTransactionsRepo,
  fixedClock,
} from '../../shared/testing/fakes';

const registry = () => new CategoryRegistry(fakeCategoriesRepo(['mascotas']));

test('add defaults the date to today and currency to ARS', async () => {
  const repo = fakeTransactionsRepo();
  const useCase = new AddTransaction(
    repo,
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
    fakeTransactionClassifier(),
  );
  const { transaction } = await useCase.execute({
    amount: 3000,
    description: 'Café',
    merchant: 'Starbucks',
    category: 'comida',
  });
  expect(transaction.date).toBe('2026-05-17');
  expect(transaction.currency).toBe('ARS');
  expect(await repo.all()).toHaveLength(1);
});

test('add falls back to a merchant rule, then to otros', async () => {
  const withRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo({ merchants: { Coderhouse: 'educacion' } })),
    fixedClock('2026-05-17'),
    registry(),
    fakeTransactionClassifier(),
  );
  const ruled = await withRule.execute({ amount: 50000, description: 'Curso', merchant: 'Coderhouse' });
  expect(ruled.transaction.category).toBe('educacion');

  const noRule = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
    fakeTransactionClassifier(),
  );
  const unruled = await noRule.execute({ amount: 1000, description: 'X', merchant: 'Desconocido' });
  expect(unruled.transaction.category).toBe('otros');
});

test('add accepts a custom category that exists in the registry', async () => {
  const useCase = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
    fakeTransactionClassifier(),
  );
  const { transaction } = await useCase.execute({
    amount: 2000,
    description: 'Alimento',
    merchant: 'Pet Shop',
    category: 'mascotas',
  });
  expect(transaction.category).toBe('mascotas');
});

test('add rejects a category that is not in the registry', async () => {
  const useCase = new AddTransaction(
    fakeTransactionsRepo(),
    new CategoryResolver(fakeCategorizationRepo()),
    fixedClock('2026-05-17'),
    registry(),
    fakeTransactionClassifier(),
  );
  await expect(
    useCase.execute({ amount: 2000, description: 'X', merchant: 'Y', category: 'inventada' }),
  ).rejects.toThrow(DomainError);
});

test('add sets source=manual when category is provided', async () => {
  const txs = fakeTransactionsRepo();
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const reg = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => {
    throw new Error('should not be called');
  });
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), reg, classifier);

  const { transaction } = await useCase.execute({
    amount: 1000,
    merchant: 'X',
    description: 'd',
    category: 'comida',
  });

  expect(transaction.category).toBe('comida');
  expect(transaction.classificationSource).toBe('manual');
  expect(transaction.classificationConfidence).toBeUndefined();
});

test('add sets source=override when merchant has an override and no category is provided', async () => {
  const txs = fakeTransactionsRepo();
  const overrides = fakeCategorizationRepo({ merchants: { Rappi: 'comida' } });
  const resolver = new CategoryResolver(overrides);
  const reg = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => {
    throw new Error('should not be called');
  });
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), reg, classifier);

  const { transaction } = await useCase.execute({
    amount: 1000,
    merchant: 'Rappi',
    description: 'd',
  });

  expect(transaction.category).toBe('comida');
  expect(transaction.classificationSource).toBe('override');
});

test('add calls the classifier when no category and no override', async () => {
  const txs = fakeTransactionsRepo();
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const reg = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => ({ category: 'comida', confidence: 0.82 }));
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), reg, classifier);

  const { transaction } = await useCase.execute({
    amount: 1000,
    merchant: 'Pedidos Ya',
    description: 'd',
  });

  expect(transaction.category).toBe('comida');
  expect(transaction.classificationSource).toBe('classifier');
  expect(transaction.classificationConfidence).toBe(0.82);
});

test('add marks source=fallback when the classifier returns confidence 0', async () => {
  const txs = fakeTransactionsRepo();
  const resolver = new CategoryResolver(fakeCategorizationRepo());
  const reg = new CategoryRegistry(fakeCategoriesRepo());
  const classifier = fakeTransactionClassifier(() => ({ category: 'otros', confidence: 0 }));
  const useCase = new AddTransaction(txs, resolver, fixedClock('2026-05-01'), reg, classifier);

  const { transaction } = await useCase.execute({
    amount: 1000,
    merchant: 'Desconocido',
    description: 'd',
  });

  expect(transaction.category).toBe('otros');
  expect(transaction.classificationSource).toBe('fallback');
  expect(transaction.classificationConfidence).toBe(0);
});
