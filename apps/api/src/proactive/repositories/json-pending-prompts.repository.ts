import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { pendingPromptsFile } from '../../shared/providers/paths';
import type { PendingPrompt, NoticeReason } from '../domain/pending-prompt';
import type {
  NewPendingPrompt,
  PendingPromptsRepository,
} from '../domain/pending-prompts.repository';

/**
 * Persisted row shape — same as `PendingPrompt`, except `operationType` and
 * `counterparty` are optional because rows written before those fields landed
 * don't have them on disk.
 */
type Row = Omit<PendingPrompt, 'operationType' | 'counterparty'> & {
  operationType?: PendingPrompt['operationType'];
  counterparty?: PendingPrompt['counterparty'];
};

/** Apply field defaults for legacy rows missing the newer fields. */
function toEntity(row: Row): PendingPrompt {
  return {
    ...row,
    operationType: row.operationType ?? 'regular_payment',
    counterparty: row.counterparty ?? null,
  };
}

@Injectable()
export class JsonPendingPromptsRepository implements PendingPromptsRepository {
  private readonly store: JsonStore<Row[]> = createJsonStore<Row[]>(
    pendingPromptsFile(),
    [],
  );

  async create(p: NewPendingPrompt): Promise<PendingPrompt> {
    const prompt: PendingPrompt = {
      ...p,
      id: `pp_${randomUUID()}`,
      resolvedTransactionId: null,
      resolvedAt: null,
    };
    const all = await this.store.read();
    all.push(prompt);
    await this.store.write(all);
    return prompt;
  }

  async findByMpPaymentId(userId: string, mpPaymentId: string): Promise<PendingPrompt | null> {
    const all = await this.store.read();
    const row = all.find((p) => p.userId === userId && p.mpPaymentId === mpPaymentId);
    return row ? toEntity(row) : null;
  }

  async listPending(userId: string): Promise<PendingPrompt[]> {
    const all = await this.store.read();
    return all
      .filter((p) => p.userId === userId && (p.status === 'pending' || p.status === 'auto'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toEntity);
  }

  async getById(userId: string, id: string): Promise<PendingPrompt | null> {
    const all = await this.store.read();
    const row = all.find((p) => p.userId === userId && p.id === id);
    return row ? toEntity(row) : null;
  }

  private async patch(id: string, fields: Partial<PendingPrompt>): Promise<void> {
    const all = await this.store.read();
    const i = all.findIndex((p) => p.id === id);
    if (i === -1) return;
    all[i] = { ...all[i], ...fields };
    await this.store.write(all);
  }

  markAdded(id: string, txId: string): Promise<void> {
    return this.patch(id, {
      status: 'added',
      resolvedTransactionId: txId,
      resolvedAt: new Date().toISOString(),
    });
  }

  markDiscarded(id: string, reason?: NoticeReason): Promise<void> {
    return this.patch(id, {
      status: 'discarded',
      resolvedAt: new Date().toISOString(),
      // Persist the reversal reason when a refund/chargeback discarded the prompt.
      ...(reason ? { noticeReason: reason } : {}),
    });
  }
}
