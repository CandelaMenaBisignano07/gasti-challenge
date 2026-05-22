import type { MpPollCursor } from './mp-poll-cursor';

export const MP_POLL_CURSORS_REPOSITORY = 'MP_POLL_CURSORS_REPOSITORY';

export interface MpPollCursorsRepository {
  getByUserId(userId: string): Promise<MpPollCursor | null>;
  upsert(cursor: MpPollCursor): Promise<void>;
}
