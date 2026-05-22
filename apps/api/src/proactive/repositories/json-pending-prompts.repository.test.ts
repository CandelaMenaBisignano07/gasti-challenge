import { test, expect, beforeEach, afterAll } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import type { PendingPrompt } from '../domain/pending-prompt';
import type { NewPendingPrompt } from '../domain/pending-prompts.repository';

// Point the repository's JSON store at a throwaway temp file. paths.ts reads
// PENDING_PROMPTS_FILE at module-eval time, so set it before the dynamic import.
const TMP = join(tmpdir(), `gasti-pp-${process.pid}-${Date.now()}.json`);
process.env.PENDING_PROMPTS_FILE = TMP;

beforeEach(() => writeFileSync(TMP, '[]', 'utf-8'));
afterAll(() => {
  if (existsSync(TMP)) rmSync(TMP);
});

/** A NewPendingPrompt for `default-user`. */
function base(over: Partial<NewPendingPrompt> = {}): NewPendingPrompt {
  return {
    userId: 'default-user',
    mpPaymentId: 'PAY',
    kind: 'expense',
    amount: 1000,
    merchant: 'Rappi',
    paymentDate: '2026-05-18T00:00:00.000Z',
    suggestedCategory: 'comida',
    suggestedDescription: 'Pedido',
    operationType: 'regular_payment',
    confidence: 0.8,
    intent: 'confirm',
    noticeReason: null,
    status: 'pending',
    createdAt: '2026-05-18T00:00:00.000Z',
    ...over,
  };
}

test('listPending returns only pending + auto prompts, newest first', async () => {
  const { JsonPendingPromptsRepository } = await import('./json-pending-prompts.repository');
  const repo = new JsonPendingPromptsRepository();

  await repo.create(base({ createdAt: '2026-05-18T10:00:00.000Z', status: 'pending' }));
  await repo.create(base({ createdAt: '2026-05-18T12:00:00.000Z', status: 'auto' }));
  const added = await repo.create(base({ createdAt: '2026-05-18T11:00:00.000Z', status: 'pending' }));
  await repo.markAdded(added.id, 'txn_001'); // now 'added' — excluded from listPending

  const out = await repo.listPending('default-user');
  expect(out.map((p) => p.createdAt)).toEqual([
    '2026-05-18T12:00:00.000Z',
    '2026-05-18T10:00:00.000Z',
  ]);
});

test('listPending isolates by userId', async () => {
  const { JsonPendingPromptsRepository } = await import('./json-pending-prompts.repository');
  const repo = new JsonPendingPromptsRepository();

  await repo.create(base({ userId: 'default-user' }));
  await repo.create(base({ userId: 'other-user' }));

  expect(await repo.listPending('default-user')).toHaveLength(1);
  expect(await repo.listPending('other-user')).toHaveLength(1);
});

test('markDiscarded with a reason persists noticeReason', async () => {
  const { JsonPendingPromptsRepository } = await import('./json-pending-prompts.repository');
  const repo = new JsonPendingPromptsRepository();

  const prompt = await repo.create(base({ status: 'pending' }));
  await repo.markDiscarded(prompt.id, 'mp_refund');

  const got = await repo.getById('default-user', prompt.id);
  expect(got?.status).toBe('discarded');
  expect(got?.noticeReason).toBe('mp_refund');
  expect(got?.resolvedAt).not.toBeNull();
});

test('findByMpPaymentId matches on user + payment id', async () => {
  const { JsonPendingPromptsRepository } = await import('./json-pending-prompts.repository');
  const repo = new JsonPendingPromptsRepository();

  await repo.create(base({ mpPaymentId: 'PAY-42' }));

  expect((await repo.findByMpPaymentId('default-user', 'PAY-42'))?.mpPaymentId).toBe('PAY-42');
  expect(await repo.findByMpPaymentId('default-user', 'PAY-99')).toBeNull();
  expect(await repo.findByMpPaymentId('other-user', 'PAY-42')).toBeNull();
});

test('legacy row missing operationType defaults to regular_payment', async () => {
  // Simulate a row persisted before T19 — no `operationType` field on disk.
  const legacyRow = {
    id: 'pp_legacy_1',
    userId: 'default-user',
    mpPaymentId: 'PAY-LEGACY',
    kind: 'expense',
    amount: 1000,
    merchant: 'Rappi',
    paymentDate: '2026-05-18T00:00:00.000Z',
    suggestedCategory: 'comida',
    suggestedDescription: 'Pedido',
    confidence: 0.8,
    intent: 'confirm',
    noticeReason: null,
    status: 'pending',
    resolvedTransactionId: null,
    createdAt: '2026-05-18T00:00:00.000Z',
    resolvedAt: null,
  };
  writeFileSync(TMP, JSON.stringify([legacyRow]), 'utf-8');

  const { JsonPendingPromptsRepository } = await import('./json-pending-prompts.repository');
  const repo = new JsonPendingPromptsRepository();

  const byId = await repo.getById('default-user', 'pp_legacy_1');
  expect(byId?.operationType).toBe('regular_payment');

  const byPayment = await repo.findByMpPaymentId('default-user', 'PAY-LEGACY');
  expect(byPayment?.operationType).toBe('regular_payment');

  const listed = await repo.listPending('default-user');
  expect(listed).toHaveLength(1);
  expect(listed[0].operationType).toBe('regular_payment');
});
