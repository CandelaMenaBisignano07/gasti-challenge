import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateMpSource } from './migrate-mp-source';

describe('migrate-mp-source', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('renames mp_webhook → mercadopago in transactions.json', async () => {
    const file = join(dir, 'transactions.json');
    writeFileSync(
      file,
      JSON.stringify([
        { id: '1', source: 'mp_webhook', amount: 100 },
        { id: '2', source: 'manual', amount: 200 },
        { id: '3', source: 'mercadopago', amount: 300 },
      ]),
    );
    await migrateMpSource({ transactionsFile: file, promptsFile: null });
    const got = JSON.parse(readFileSync(file, 'utf8'));
    expect(got[0].source).toBe('mercadopago');
    expect(got[1].source).toBe('manual');
    expect(got[2].source).toBe('mercadopago');
  });

  test('defaults operationType on prompts missing the field', async () => {
    const file = join(dir, 'pending-prompts.json');
    writeFileSync(
      file,
      JSON.stringify([
        { id: 'a', mpPaymentId: '1' /* no operationType */ },
        { id: 'b', mpPaymentId: '2', operationType: 'money_transfer' },
      ]),
    );
    await migrateMpSource({ transactionsFile: null, promptsFile: file });
    const got = JSON.parse(readFileSync(file, 'utf8'));
    expect(got[0].operationType).toBe('regular_payment');
    expect(got[1].operationType).toBe('money_transfer');
  });

  test('is idempotent — running twice yields the same result', async () => {
    const file = join(dir, 'transactions.json');
    writeFileSync(file, JSON.stringify([{ id: '1', source: 'mp_webhook' }]));
    await migrateMpSource({ transactionsFile: file, promptsFile: null });
    const after1 = readFileSync(file, 'utf8');
    await migrateMpSource({ transactionsFile: file, promptsFile: null });
    const after2 = readFileSync(file, 'utf8');
    expect(after2).toBe(after1);
  });
});
