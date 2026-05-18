import { Injectable } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { TRANSACTIONS_FILE } from '../../shared/providers/paths';
import {
  transactionSchema,
  type Transaction,
  type TransactionStatus,
} from '../../shared/domain/transaction';
import type { TransactionFields, TransactionsRepository } from '../domain/transactions.repository';

@Injectable()
export class JsonTransactionsRepository implements TransactionsRepository {
  private readonly store: JsonStore<unknown[]> = createJsonStore<unknown[]>(TRANSACTIONS_FILE, []);

  // Normalize-on-read: every raw row is parsed through transactionSchema, so the
  // checked-in 7-field data/transactions.json upgrades to the 13-field shape in
  // memory. Note: the first mutation (add/update/delete/updateStatus) writes the
  // normalized rows back, so transactions.json is rewritten in the 13-field shape
  // once the app runs — expected, not a bug.
  async all(): Promise<Transaction[]> {
    const raw = await this.store.read();
    return raw.map((r) => transactionSchema.parse(r));
  }

  async add(tx: Transaction): Promise<void> {
    const txs = await this.all();
    txs.push(tx);
    await this.store.write(txs);
  }

  async update(id: string, fields: TransactionFields): Promise<Transaction | null> {
    const txs = await this.all();
    const index = txs.findIndex((t) => t.id === id);
    if (index === -1) return null;
    txs[index] = { ...txs[index], ...fields };
    await this.store.write(txs);
    return txs[index];
  }

  async delete(id: string): Promise<boolean> {
    const txs = await this.all();
    const next = txs.filter((t) => t.id !== id);
    if (next.length === txs.length) return false;
    await this.store.write(next);
    return true;
  }

  async nextId(): Promise<string> {
    const txs = await this.all();
    const max = txs.reduce((m, t) => {
      const n = Number(t.id.replace(/\D/g, ''));
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `txn_${String(max + 1).padStart(3, '0')}`;
  }

  async reassignCategory(from: string, to: string): Promise<void> {
    const txs = await this.store.read();
    let changed = false;
    for (const t of txs as Array<{ category: string }>) {
      if (t.category === from) {
        t.category = to;
        changed = true;
      }
    }
    if (changed) await this.store.write(txs);
  }

  async getById(userId: string, id: string): Promise<Transaction | null> {
    const txs = await this.all();
    return txs.find((t) => t.id === id && t.userId === userId) ?? null;
  }

  async findByMpPaymentId(userId: string, mpPaymentId: string): Promise<Transaction | null> {
    const txs = await this.all();
    return txs.find((t) => t.userId === userId && t.mpPaymentId === mpPaymentId) ?? null;
  }

  async updateStatus(id: string, newStatus: TransactionStatus, at: Date): Promise<void> {
    const txs = await this.all();
    const index = txs.findIndex((t) => t.id === id);
    if (index === -1) return;
    // A status change is a point-in-time event — stamp a full ISO timestamp,
    // not a date-only string (consistent with PendingPrompt.resolvedAt).
    txs[index] = { ...txs[index], status: newStatus, statusChangedAt: at.toISOString() };
    await this.store.write(txs);
  }
}
