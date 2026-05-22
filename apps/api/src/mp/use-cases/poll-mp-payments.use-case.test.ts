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

describe('PollMpPayments — happy path', () => {
  test('filters account_fund, processes the rest, advances cursor to clock.now()', async () => {
    const now = new Date('2026-05-22T18:30:00.000Z');

    // Users repo: getById returns the connected user.
    const getById = mock(async (_userId: string) => baseUser);
    const users = { getById } as Pick<UsersRepository, 'getById'> as UsersRepository;

    // Cursors repo: no prior cursor; capture the upsert payload.
    const cursorGet = mock(async (_userId: string): Promise<MpPollCursor | null> => null);
    const cursorUpsert = mock(async (_cursor: MpPollCursor) => {});
    const cursors = {
      getByUserId: cursorGet,
      upsert: cursorUpsert,
    } satisfies MpPollCursorsRepository;

    // Gateway: 3 payments, the middle one is account_fund.
    const results: MpPayment[] = [
      payment({ id: 1, operation_type: 'regular_payment' }),
      payment({ id: 2, operation_type: 'account_fund' }),
      payment({ id: 3, operation_type: 'money_transfer' }),
    ];
    const searchResult: MpPaymentsSearchResult = {
      results,
      truncated: false,
      totalReported: 3,
    };
    const search = mock(async () => searchResult);
    const gateway = { search } as MpPaymentsSearchGateway;

    // ProcessMpEvent: capture each call.
    const processExecute = mock(async (_input: ProcessMpEventInput) => {});
    const processEvent = {
      execute: processExecute,
    } as Pick<ProcessMpEvent, 'execute'> as ProcessMpEvent;

    // RefreshMpToken: not exercised in the happy path (token not expired).
    const refreshExecute = mock(async (_user: User) => 'tok');
    const refreshToken = {
      execute: refreshExecute,
    } as Pick<RefreshMpToken, 'execute'> as RefreshMpToken;

    // Clock: fixed at the assertion's expected ISO.
    const clock: Clock = { now: () => now };

    const useCase = new PollMpPayments(
      users,
      cursors,
      gateway,
      processEvent,
      refreshToken,
      clock,
    );

    await useCase.execute({ userId: 'u1' });

    // processEvent.execute called exactly twice (account_fund filtered out).
    expect(processExecute.mock.calls).toHaveLength(2);
    expect(processExecute.mock.calls[0][0].payment.id).toBe(1);
    expect(processExecute.mock.calls[0][0].user).toBe(baseUser);
    expect(processExecute.mock.calls[1][0].payment.id).toBe(3);
    expect(processExecute.mock.calls[1][0].user).toBe(baseUser);

    // cursors.upsert called once with lastPolledAt === clock.now().
    expect(cursorUpsert.mock.calls).toHaveLength(1);
    const upserted = cursorUpsert.mock.calls[0][0];
    expect(upserted.userId).toBe('u1');
    expect(upserted.lastPolledAt.toISOString()).toBe('2026-05-22T18:30:00.000Z');

    // Refresh path NOT exercised here (token expires in 2030).
    expect(refreshExecute.mock.calls).toHaveLength(0);
  });
});
