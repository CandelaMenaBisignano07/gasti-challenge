import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { isMpTokenExpired } from '../../users/domain/user';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/domain/users.repository';
import {
  MP_PAYMENTS_SEARCH_GATEWAY,
  type MpPaymentsSearchGateway,
} from '../domain/mp-payments-search.gateway';
import {
  MP_POLL_CURSORS_REPOSITORY,
  type MpPollCursorsRepository,
} from '../domain/mp-poll-cursors.repository';
import { pollWindowBegin, type MpPollCursor } from '../domain/mp-poll-cursor';
import { isAcceptedOperationType } from '../domain/operation-type';
import { ProcessMpEvent } from './process-mp-event.use-case';
import { RefreshMpToken } from './refresh-mp-token.use-case';

// Tighter than `isMpTokenExpired`'s default 5 min: the poller runs frequently,
// so we only need enough headroom to outlast a single in-flight search call.
const TOKEN_REFRESH_SKEW_MS = 2 * 60_000;

export interface PollMpPaymentsInput {
  readonly userId: string;
}

/**
 * Central orchestrator of the MP poll pipeline (spec §4). For one user:
 *  1. Resolve the user (and refresh their access token if close to expiry).
 *  2. Compute the [begin, end] poll window from their cursor.
 *  3. Search MP for payments updated in that window.
 *  4. Drop `account_fund` (internal wallet top-ups, never real movements).
 *  5. Hand each remaining payment to ProcessMpEvent.
 *  6. Advance the cursor to `end` (= clock.now()).
 *
 * If `processEvent.execute` throws, the exception propagates and the cursor is
 * NOT advanced — so the next poll retries the same window.
 */
@Injectable()
export class PollMpPayments {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(MP_POLL_CURSORS_REPOSITORY)
    private readonly cursors: MpPollCursorsRepository,
    @Inject(MP_PAYMENTS_SEARCH_GATEWAY)
    private readonly gateway: MpPaymentsSearchGateway,
    private readonly processEvent: ProcessMpEvent,
    private readonly refreshToken: RefreshMpToken,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId }: PollMpPaymentsInput): Promise<void> {
    let user = await this.users.getById(userId);
    if (!user.mpUserId || !user.mpAccessToken) return; // not connected

    if (isMpTokenExpired(user, TOKEN_REFRESH_SKEW_MS)) {
      await this.refreshToken.execute(user); // mutates tokens via users.updateMpTokens
      user = await this.users.getById(userId); // re-fetch the now-updated user
    }
    // After the connected-check and the optional refresh, the token is guaranteed
    // non-null. Pull it into a local so the call site doesn't need a `!` assertion.
    const accessToken = user.mpAccessToken as string;

    const end = this.clock.now();
    const cursor: MpPollCursor =
      (await this.cursors.getByUserId(userId)) ?? { userId, lastPolledAt: end };
    const begin = pollWindowBegin(cursor);

    const { results } = await this.gateway.search({
      accessToken,
      beginDate: begin,
      endDate: end,
    });

    for (const p of results) {
      if (!isAcceptedOperationType(p.operation_type)) continue;
      await this.processEvent.execute({ payment: p, user });
    }

    await this.cursors.upsert({ userId, lastPolledAt: end });
  }
}
