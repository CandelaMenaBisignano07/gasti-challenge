export interface MpPollCursor {
  readonly userId: string;
  readonly lastPolledAt: Date;
}

/**
 * Compute the begin date for a poll window, applying a 5-minute backwards
 * overlap to absorb MP's tendency to backdate payments. The cron at T sees
 * payments that MP exposed late, dedupe at the repo layer prevents duplicates.
 */
export const OVERLAP_MS = 5 * 60_000;
export function pollWindowBegin(cursor: MpPollCursor): Date {
  return new Date(cursor.lastPolledAt.getTime() - OVERLAP_MS);
}

export function advance(cursor: MpPollCursor, to: Date): MpPollCursor {
  return { userId: cursor.userId, lastPolledAt: to };
}
