import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { backfillSummariesFile } from '../../shared/providers/paths';
import type { BackfillScope } from '../../mp/domain/backfill-scope';
import type { OperationType } from '../../mp/domain/operation-type';
import type { BackfillSummary } from '../domain/backfill-summary';
import type { BackfillSummariesRepository } from '../domain/backfill-summaries.repository';

interface Row {
  id: string;
  userId: string;
  scope: BackfillScope;
  rangeBegin: string;
  rangeEnd: string;
  totalImported: number;
  byOperationType: Record<OperationType, number>;
  lowConfidenceCount: number;
  truncated: boolean;
  status: 'visible' | 'dismissed';
  createdAt: string;
}

@Injectable()
export class JsonBackfillSummariesRepository implements BackfillSummariesRepository {
  private readonly store: JsonStore<Row[]> = createJsonStore<Row[]>(
    backfillSummariesFile(),
    [],
  );

  private toEntity(r: Row): BackfillSummary {
    return {
      id: r.id,
      userId: r.userId,
      scope: r.scope,
      rangeBegin: new Date(r.rangeBegin),
      rangeEnd: new Date(r.rangeEnd),
      totalImported: r.totalImported,
      byOperationType: r.byOperationType,
      lowConfidenceCount: r.lowConfidenceCount,
      truncated: r.truncated,
      status: r.status,
      createdAt: new Date(r.createdAt),
    };
  }

  async create(
    input: Omit<BackfillSummary, 'id' | 'createdAt'>,
  ): Promise<BackfillSummary> {
    const rows = await this.store.read();
    const row: Row = {
      id: randomUUID(),
      userId: input.userId,
      scope: input.scope,
      rangeBegin: input.rangeBegin.toISOString(),
      rangeEnd: input.rangeEnd.toISOString(),
      totalImported: input.totalImported,
      byOperationType: input.byOperationType,
      lowConfidenceCount: input.lowConfidenceCount,
      truncated: input.truncated,
      status: input.status,
      createdAt: new Date().toISOString(),
    };
    rows.push(row);
    await this.store.write(rows);
    return this.toEntity(row);
  }

  async getById(userId: string, id: string): Promise<BackfillSummary | null> {
    const rows = await this.store.read();
    const row = rows.find((r) => r.userId === userId && r.id === id);
    return row ? this.toEntity(row) : null;
  }

  async listForUser(userId: string): Promise<BackfillSummary[]> {
    const rows = await this.store.read();
    return rows.filter((r) => r.userId === userId).map((r) => this.toEntity(r));
  }

  async markDismissed(id: string): Promise<void> {
    const rows = await this.store.read();
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) return;
    rows[i] = { ...rows[i], status: 'dismissed' };
    await this.store.write(rows);
  }
}
