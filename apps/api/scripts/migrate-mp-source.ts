import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Args {
  transactionsFile: string | null;
  promptsFile: string | null;
}

/**
 * One-shot migration:
 *   1. Rename `source: 'mp_webhook'` → `'mercadopago'` in the transactions
 *      seed (T20 dropped the legacy enum value).
 *   2. Default `operationType` to `'regular_payment'` on pending prompts
 *      missing the field (T19 added it).
 *
 * Idempotent: only writes when a row actually changed. Safe to run repeatedly
 * and safe when either data file is missing — the branch is skipped silently.
 */
export async function migrateMpSource({
  transactionsFile,
  promptsFile,
}: Args): Promise<void> {
  if (transactionsFile && existsSync(transactionsFile)) {
    const rows = JSON.parse(
      readFileSync(transactionsFile, 'utf8'),
    ) as Array<Record<string, unknown>>;
    let changed = false;
    for (const r of rows) {
      if (r.source === 'mp_webhook') {
        r.source = 'mercadopago';
        changed = true;
      }
    }
    if (changed) writeFileSync(transactionsFile, JSON.stringify(rows, null, 2));
  }

  if (promptsFile && existsSync(promptsFile)) {
    const rows = JSON.parse(
      readFileSync(promptsFile, 'utf8'),
    ) as Array<Record<string, unknown>>;
    let changed = false;
    for (const r of rows) {
      if (!r.operationType) {
        r.operationType = 'regular_payment';
        changed = true;
      }
    }
    if (changed) writeFileSync(promptsFile, JSON.stringify(rows, null, 2));
  }
}

// CLI entry — `bun run scripts/migrate-mp-source.ts`
if (import.meta.path === Bun.main) {
  const apiRoot = join(__dirname, '..');
  await migrateMpSource({
    transactionsFile: join(apiRoot, '..', '..', 'data', 'transactions.json'),
    promptsFile: join(apiRoot, 'data', 'pending-prompts.json'),
  });
  console.log('migrate-mp-source: done');
}
