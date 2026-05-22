import { describe, expect, mock, test } from 'bun:test';
import { PollMpPayments } from './poll-mp-payments.use-case';
import type {
  MpPaymentsSearchGateway,
  MpPaymentsSearchResult,
} from '../domain/mp-payments-search.gateway';
import type { MpPollCursorsRepository } from '../domain/mp-poll-cursors.repository';
import type { MpPollCursor } from '../domain/mp-poll-cursor';
import type { UsersRepository } from '../../users/domain/users.repository';
import type { User } from '../../users/domain/user';
import type { MpPayment } from '../domain/mp-payment';
import type { ProcessMpEvent, ProcessMpEventInput } from './process-mp-event.use-case';
import type { RefreshMpToken } from './refresh-mp-token.use-case';
import type { Clock } from '../../shared/providers/clock';

const baseUser: User = {
  id: 'u1',
  displayName: null,
  languagePref: null,
  mpUserId: '12345',
  mpAccessToken: 'tok',
  mpRefreshToken: 'rtok',
  mpTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  mpScope: 'payments read',
  mpLiveMode: true,
  mpConnectedAt: new Date('2026-05-22T18:00:00.000Z'),
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};

function payment(overrides: Partial<MpPayment>): MpPayment {
  return {
    id: 1,
    status: 'approved',
    status_detail: 'accredited',
    captured: true,
    operation_type: 'regular_payment',
    transaction_amount: 100,
    date_created: '2026-05-22T18:25:00.000Z',
    date_approved: '2026-05-22T18:25:00.000Z',
    description: 'Test',
    collector_id: 99,
    payer: { first_name: 'Test', last_name: 'User', email: 'someone@example.com' },
    additional_info: { items: [{ title: 'Test' }] },
    ...overrides,
  };
}

interface BuildOptions {
  user?: User | User[]; // single user, or sequence returned by repeated getById calls
  cursor?: MpPollCursor | null;
  searchResult?: MpPaymentsSearchResult;
  processImpl?: (input: ProcessMpEventInput) => Promise<void>;
  refreshImpl?: (user: User) => Promise<string>;
  clockNow?: Date;
}

function build(opts: BuildOptions = {}) {
  const userSequence = Array.isArray(opts.user) ? opts.user : [opts.user ?? baseUser];
  let userCall = 0;
  const getById = mock(async (_userId: string) => {
    const u = userSequence[Math.min(userCall, userSequence.length - 1)];
    userCall += 1;
    return u;
  });
  const users = { getById } as unknown as UsersRepository;

  const cursorGet = mock(
    async (_userId: string): Promise<MpPollCursor | null> => opts.cursor ?? null,
  );
  const cursorUpsert = mock(async (_cursor: MpPollCursor) => {});
  const cursors = {
    getByUserId: cursorGet,
    upsert: cursorUpsert,
  } satisfies MpPollCursorsRepository;

  const searchResult: MpPaymentsSearchResult = opts.searchResult ?? {
    results: [],
    truncated: false,
    totalReported: 0,
  };
  const search = mock(async () => searchResult);
  const gateway = { search } as unknown as MpPaymentsSearchGateway;

  const processExecute = mock(opts.processImpl ?? (async (_input: ProcessMpEventInput) => {}));
  const processEvent = { execute: processExecute } as unknown as ProcessMpEvent;

  const refreshExecute = mock(opts.refreshImpl ?? (async (_user: User) => 'tok'));
  const refreshToken = { execute: refreshExecute } as unknown as RefreshMpToken;

  const now = opts.clockNow ?? new Date('2026-05-22T18:30:00.000Z');
  const clock: Clock = { now: () => now };

  const uc = new PollMpPayments(users, cursors, gateway, processEvent, refreshToken, clock);

  return {
    uc,
    mocks: { getById, cursorGet, cursorUpsert, search, processExecute, refreshExecute },
  };
}

describe('PollMpPayments — happy path', () => {
  test('filters account_fund, processes the rest, advances cursor to clock.now()', async () => {
    const results: MpPayment[] = [
      payment({ id: 1, operation_type: 'regular_payment' }),
      payment({ id: 2, operation_type: 'account_fund' }),
      payment({ id: 3, operation_type: 'money_transfer' }),
    ];
    const { uc, mocks } = build({
      searchResult: { results, truncated: false, totalReported: 3 },
    });

    await uc.execute({ userId: 'u1' });

    // processEvent.execute called exactly twice (account_fund filtered out).
    expect(mocks.processExecute.mock.calls).toHaveLength(2);
    expect(mocks.processExecute.mock.calls[0][0].payment.id).toBe(1);
    expect(mocks.processExecute.mock.calls[0][0].user).toBe(baseUser);
    expect(mocks.processExecute.mock.calls[1][0].payment.id).toBe(3);
    expect(mocks.processExecute.mock.calls[1][0].user).toBe(baseUser);

    // cursors.upsert called once with lastPolledAt === clock.now().
    expect(mocks.cursorUpsert.mock.calls).toHaveLength(1);
    const upserted = mocks.cursorUpsert.mock.calls[0][0];
    expect(upserted.userId).toBe('u1');
    expect(upserted.lastPolledAt.toISOString()).toBe('2026-05-22T18:30:00.000Z');

    // Refresh path NOT exercised here (token expires in 2030).
    expect(mocks.refreshExecute.mock.calls).toHaveLength(0);
  });
});

describe('PollMpPayments — edge cases', () => {
  test('cursor does NOT advance when processEvent.execute throws', async () => {
    const boom = new Error('classifier exploded');
    const { uc, mocks } = build({
      searchResult: {
        results: [payment({ id: 7, operation_type: 'regular_payment' })],
        truncated: false,
        totalReported: 1,
      },
      processImpl: async () => {
        throw boom;
      },
    });

    await expect(uc.execute({ userId: 'u1' })).rejects.toBe(boom);

    // Cursor untouched — next poll must retry the same window.
    expect(mocks.cursorUpsert.mock.calls).toHaveLength(0);
  });

  test('skips entirely when user is not MP-connected', async () => {
    const disconnected: User = { ...baseUser, mpUserId: null, mpAccessToken: null };
    const { uc, mocks } = build({ user: disconnected });

    await uc.execute({ userId: 'u1' });

    expect(mocks.search.mock.calls).toHaveLength(0);
    expect(mocks.cursorUpsert.mock.calls).toHaveLength(0);
    expect(mocks.processExecute.mock.calls).toHaveLength(0);
    expect(mocks.refreshExecute.mock.calls).toHaveLength(0);
  });

  test('refreshes token first, re-fetches user, and calls gateway with the NEW token', async () => {
    const aboutToExpire: User = {
      ...baseUser,
      mpAccessToken: 'stale-tok',
      mpTokenExpiresAt: new Date(Date.now() + 60_000), // 1 min — inside the 2-min skew
    };
    const refreshed: User = {
      ...baseUser,
      mpAccessToken: 'new-tok',
      mpTokenExpiresAt: new Date(Date.now() + 6 * 3600_000), // 6h out
    };

    const { uc, mocks } = build({
      user: [aboutToExpire, refreshed], // 1st getById → about-to-expire, 2nd → refreshed
    });

    await uc.execute({ userId: 'u1' });

    // refreshToken.execute called exactly once with the about-to-expire user.
    expect(mocks.refreshExecute.mock.calls).toHaveLength(1);
    expect(mocks.refreshExecute.mock.calls[0][0]).toBe(aboutToExpire);

    // Gateway received the rotated token, NOT the stale one.
    expect(mocks.search.mock.calls).toHaveLength(1);
    expect(mocks.search.mock.calls[0][0].accessToken).toBe('new-tok');
  });
});
