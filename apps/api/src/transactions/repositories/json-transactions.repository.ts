import { Injectable } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { TRANSACTIONS_FILE } from '../../shared/providers/paths';
import type { Transaction } from '../../shared/domain/transaction';
import type { TransactionFields, TransactionsRepository } from '../domain/transactions.repository';

@Injectable()
export class JsonTransactionsRepository implements TransactionsRepository {
  private readonly store: JsonStore<Transaction[]> = createJsonStore<Transaction[]>(
    TRANSACTIONS_FILE,
    [],
  );

  all(): Promise<Transaction[]> {
    return this.store.read();
  }

  async add(tx: Transaction): Promise<void> {
    const txs = await this.store.read();
    txs.push(tx);
    await this.store.write(txs);
  }

  async update(id: string, fields: TransactionFields): Promise<Transaction | null> {
    const txs = await this.store.read();
    const index = txs.findIndex((t) => t.id === id);
    if (index === -1) return null;
    txs[index] = { ...txs[index], ...fields };
    await this.store.write(txs);
    return txs[index];
  }

  async delete(id: string): Promise<boolean> {
    const txs = await this.store.read();
    const next = txs.filter((t) => t.id !== id);
    if (next.length === txs.length) return false;
    await this.store.write(next);
    return true;
  }

  async nextId(): Promise<string> {
    const txs = await this.store.read();
    const max = txs.reduce((m, t) => {
      const n = Number(t.id.replace(/\D/g, ''));
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `txn_${String(max + 1).padStart(3, '0')}`;
  }

  async reassignCategory(from: string, to: string): Promise<void> {
    const txs = await this.store.read();
    let changed = false;
    for (const t of txs) {
      if (t.category === from) {
        t.category = to;
        changed = true;
      }
    }
    if (changed) await this.store.write(txs);
  }
}
