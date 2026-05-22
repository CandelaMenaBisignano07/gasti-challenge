import { Injectable } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { mpPollCursorsFile } from '../../shared/providers/paths';
import type { MpPollCursor } from '../domain/mp-poll-cursor';
import type { MpPollCursorsRepository } from '../domain/mp-poll-cursors.repository';

interface CursorRow {
  userId: string;
  lastPolledAt: string;
}

@Injectable()
export class JsonMpPollCursorsRepository implements MpPollCursorsRepository {
  private readonly store: JsonStore<CursorRow[]> = createJsonStore<CursorRow[]>(
    mpPollCursorsFile(),
    [],
  );

  async getByUserId(userId: string): Promise<MpPollCursor | null> {
    const rows = await this.store.read();
    const row = rows.find((r) => r.userId === userId);
    return row ? { userId: row.userId, lastPolledAt: new Date(row.lastPolledAt) } : null;
  }

  async upsert(cursor: MpPollCursor): Promise<void> {
    const rows = await this.store.read();
    const i = rows.findIndex((r) => r.userId === cursor.userId);
    const next: CursorRow = {
      userId: cursor.userId,
      lastPolledAt: cursor.lastPolledAt.toISOString(),
    };
    if (i === -1) rows.push(next);
    else rows[i] = next;
    await this.store.write(rows);
  }
}
