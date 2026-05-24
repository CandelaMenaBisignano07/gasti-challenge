import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonTransactionsRepository } from './json-transactions.repository';

test('updateStatus persists newStatusDetail alongside status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gasti-tx-'));
  const file = join(dir, 'transactions.json');
  writeFileSync(
    file,
    JSON.stringify([
      {
        id: 'txn_001',
        date: '2026-05-01',
        amount: 1000,
        currency: 'ARS',
        category: 'comida',
        description: 'X',
        merchant: 'X',
        userId: 'default-user',
        status: 'active',
        statusChangedAt: null,
      },
    ]),
  );
  process.env.TRANSACTIONS_FILE = file;

  const repo = new JsonTransactionsRepository();
  await repo.updateStatus('txn_001', 'charged_back', 'in_process', new Date('2026-05-23T10:00:00Z'));

  const stored = (await repo.all())[0];
  expect(stored.status).toBe('charged_back');
  expect(stored.statusDetail).toBe('in_process');
  expect(stored.statusChangedAt).toBe('2026-05-23T10:00:00.000Z');

  rmSync(dir, { recursive: true, force: true });
});
