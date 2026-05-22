import { describe, expect, mock, test } from 'bun:test';
import { BackfillMpPayments } from './backfill-mp-payments.use-case';
import type { User } from '../../users/domain/user';
import type { MpPayment } from '../domain/mp-payment';
import type { Classification } from '../domain/classification';
import type { BatchClassifier } from '../domain/batch-classifier';
import type {
  MpPaymentsSearchGateway,
  MpPaymentsSearchResult,
} from '../domain/mp-payments-search.gateway';
import type { MpPollCursorsRepository } from '../domain/mp-poll-cursors.repository';
import type { UsersRepository } from '../../users/domain/users.repository';
import type {
  CreateTransactionInput,
  TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import type { Transaction } from '../../shared/domain/transaction';
import type { BackfillSummariesRepository } from '../../proactive/domain/backfill-summaries.repository';
import type { BackfillSummary } from '../../proactive/domain/backfill-summary';
import type { PendingPromptsRepository } from '../../proactive/domain/pending-prompts.repository';
import type { PendingPrompt } from '../../proactive/domain/pending-prompt';
import type { Clock } from '../../shared/providers/clock';
import type { RefreshMpToken } from './refresh-mp-token.use-case';

const user: User = {
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
    date_created: '2026-05-21T18:25:00.000Z',
    date_approved: '2026-05-21T18:25:00.000Z',
    description: 'Test',
    collector_id: 99,
    payer: { first_name: 'Pay', last_name: 'Er', email: 'someone@example.com' },
    additional_info: { items: [{ title: 'Test Merchant' }] },
    ...overrides,
  };
}

describe('BackfillMpPayments — happy path', () => {
  test('persists transactions, low-confidence flag, summary, cursor; publishes summary', async () => {
    const payments: MpPayment[] = [
      payment({ id: 1, operation_type: 'regular_payment', transaction_amount: 250 }),
      payment({ id: 2, operation_type: 'money_transfer', transaction_amount: 1000 }),
      payment({ id: 3, operation_type: 'account_fund', transaction_amount: 999 }), // filtered
      payment({ id: 4, operation_type: 'recurring_payment', transaction_amount: 50 }),
    ];

    const searchResult: MpPaymentsSearchResult = {
      results: payments,
      truncated: false,
      totalReported: 4,
    };
    const search = mock(async () => searchResult);
    const gateway = { search } as unknown as MpPaymentsSearchGateway;

    const classifications: Classification[] = [
      { category: 'comida', suggestedDescription: 'Lunch', confidence: 0.9 },
      { category: 'transporte', suggestedDescription: 'Transfer', confidence: 0.85 },
      { category: 'otros', suggestedDescription: 'Subscription', confidence: 0.2 }, // low
    ];
    const classifyBatch = mock(async () => classifications);
    const batchClassifier = { classifyBatch } as unknown as BatchClassifier;

    const create = mock(async (input: CreateTransactionInput): Promise<Transaction> => ({
      id: `txn_${input.mpPaymentId ?? 'x'}`,
      date: input.date,
      amount: input.amount,
      currency: 'ARS',
      category: input.category,
      description: input.description,
      merchant: input.merchant,
      userId: input.userId,
      direction: input.direction,
      status: input.status ?? 'active',
      statusChangedAt: null,
      source: input.source,
      mpPaymentId: input.mpPaymentId ?? null,
      needsReview: input.needsReview ?? false,
      operationType: input.operationType ?? null,
    }));
    const findByMpPaymentId = mock(async () => null);
    const transactions = { create, findByMpPaymentId } as unknown as TransactionsRepository;

    const createdSummary: BackfillSummary = {
      id: 'sum1',
      userId: 'u1',
      scope: '7d',
      rangeBegin: new Date('2026-05-15T00:00:00.000Z'),
      rangeEnd: new Date('2026-05-22T00:00:00.000Z'),
      totalImported: 3,
      byOperationType: {
        regular_payment: 1,
        money_transfer: 1,
        recurring_payment: 1,
        account_fund: 0,
      },
      lowConfidenceCount: 1,
      truncated: false,
      status: 'visible',
      createdAt: new Date('2026-05-22T00:00:00.000Z'),
    };
    const summariesCreate = mock(async () => createdSummary);
    const summaries = {
      create: summariesCreate,
    } as unknown as BackfillSummariesRepository;

    const prompts = {
      findByMpPaymentId: mock(async () => null),
    } as unknown as PendingPromptsRepository;

    const cursorUpsert = mock(async () => {});
    const cursors = {
      getByUserId: mock(async () => null),
      upsert: cursorUpsert,
    } satisfies MpPollCursorsRepository;

    const getById = mock(async () => user);
    const users = { getById } as unknown as UsersRepository;

    const refreshExecute = mock(async () => 'tok');
    const refresh = { execute: refreshExecute } as unknown as RefreshMpToken;

    const now = new Date('2026-05-22T00:00:00.000Z');
    const clock: Clock = { now: () => now };

    const uc = new BackfillMpPayments(
      users,
      cursors,
      gateway,
      batchClassifier,
      transactions,
      summaries,
      prompts,
      refresh,
      clock,
    );

    const result = await uc.execute({ userId: 'u1', scope: '7d' });

    // Total imported = 3 (account_fund filtered out before classify/persist).
    expect(result.totalImported).toBe(3);
    expect(result.lowConfidenceCount).toBe(1);

    // transactions.create called exactly 3 times.
    expect(create.mock.calls).toHaveLength(3);

    // The low-confidence transaction should be needsReview=true with category=otros.
    const thirdCall = create.mock.calls[2][0];
    expect(thirdCall.needsReview).toBe(true);
    expect(thirdCall.category).toBe('otros');
    expect(thirdCall.source).toBe('mercadopago');

    // The high-confidence ones should be needsReview=false, with the classified category.
    expect(create.mock.calls[0][0].needsReview).toBe(false);
    expect(create.mock.calls[0][0].category).toBe('comida');
    expect(create.mock.calls[1][0].needsReview).toBe(false);
    expect(create.mock.calls[1][0].category).toBe('transporte');

    // Cursor advanced to `end` (clock.now()).
    expect(cursorUpsert.mock.calls).toHaveLength(1);
    expect(cursorUpsert.mock.calls[0][0].lastPolledAt.toISOString()).toBe(
      '2026-05-22T00:00:00.000Z',
    );

    // Summary persisted with the right byOperationType breakdown and published.
    expect(summariesCreate.mock.calls).toHaveLength(1);
    const summaryInput = summariesCreate.mock.calls[0][0];
    expect(summaryInput.byOperationType).toEqual({
      regular_payment: 1,
      money_transfer: 1,
      recurring_payment: 1,
      account_fund: 0,
    });
    expect(summaryInput.scope).toBe('7d');
    expect(summaryInput.totalImported).toBe(3);
    expect(summaryInput.lowConfidenceCount).toBe(1);
    expect(summaryInput.truncated).toBe(false);
    expect(summaryInput.status).toBe('visible');

    // Refresh path NOT exercised (token expires in 2030).
    expect(refreshExecute.mock.calls).toHaveLength(0);
  });

  test('skips payments that already exist as transactions', async () => {
    const payments: MpPayment[] = [
      payment({ id: 1, operation_type: 'regular_payment', transaction_amount: 250 }),
      payment({ id: 2, operation_type: 'money_transfer', transaction_amount: 1000 }),
      payment({ id: 3, operation_type: 'account_fund', transaction_amount: 999 }), // filtered
      payment({ id: 4, operation_type: 'recurring_payment', transaction_amount: 50 }),
    ];

    const searchResult: MpPaymentsSearchResult = {
      results: payments,
      truncated: false,
      totalReported: 4,
    };
    const search = mock(async () => searchResult);
    const gateway = { search } as unknown as MpPaymentsSearchGateway;

    // Only the fresh payments (2 and 4) are classified — payment 1 is deduped,
    // payment 3 was filtered by operation type.
    const classifications: Classification[] = [
      { category: 'transporte', suggestedDescription: 'Transfer', confidence: 0.85 },
      { category: 'otros', suggestedDescription: 'Subscription', confidence: 0.2 }, // low
    ];
    const classifyBatch = mock(async () => classifications);
    const batchClassifier = { classifyBatch } as unknown as BatchClassifier;

    const create = mock(async (input: CreateTransactionInput): Promise<Transaction> => ({
      id: `txn_${input.mpPaymentId ?? 'x'}`,
      date: input.date,
      amount: input.amount,
      currency: 'ARS',
      category: input.category,
      description: input.description,
      merchant: input.merchant,
      userId: input.userId,
      direction: input.direction,
      status: input.status ?? 'active',
      statusChangedAt: null,
      source: input.source,
      mpPaymentId: input.mpPaymentId ?? null,
      needsReview: input.needsReview ?? false,
      operationType: input.operationType ?? null,
    }));
    // Payment id=1 already exists as a transaction; all others are fresh.
    const existing: Transaction = {
      id: 'txn_1',
      date: '2026-05-21',
      amount: 250,
      currency: 'ARS',
      category: 'comida',
      description: 'Lunch',
      merchant: 'Test Merchant',
      userId: 'u1',
      direction: 'expense',
      status: 'active',
      statusChangedAt: null,
      source: 'mercadopago',
      mpPaymentId: '1',
      needsReview: false,
      operationType: 'regular_payment',
    };
    const findByMpPaymentId = mock(async (_userId: string, mpPaymentId: string) =>
      mpPaymentId === '1' ? existing : null,
    );
    const transactions = {
      create,
      findByMpPaymentId,
    } as unknown as TransactionsRepository;

    const createdSummary: BackfillSummary = {
      id: 'sum1',
      userId: 'u1',
      scope: '7d',
      rangeBegin: new Date('2026-05-15T00:00:00.000Z'),
      rangeEnd: new Date('2026-05-22T00:00:00.000Z'),
      totalImported: 2,
      byOperationType: {
        regular_payment: 0,
        money_transfer: 1,
        recurring_payment: 1,
        account_fund: 0,
      },
      lowConfidenceCount: 1,
      truncated: false,
      status: 'visible',
      createdAt: new Date('2026-05-22T00:00:00.000Z'),
    };
    const summariesCreate = mock(async () => createdSummary);
    const summaries = {
      create: summariesCreate,
    } as unknown as BackfillSummariesRepository;

    const prompts = {
      findByMpPaymentId: mock(async () => null),
    } as unknown as PendingPromptsRepository;

    const cursorUpsert = mock(async () => {});
    const cursors = {
      getByUserId: mock(async () => null),
      upsert: cursorUpsert,
    } satisfies MpPollCursorsRepository;

    const getById = mock(async () => user);
    const users = { getById } as unknown as UsersRepository;

    const refreshExecute = mock(async () => 'tok');
    const refresh = { execute: refreshExecute } as unknown as RefreshMpToken;

    const now = new Date('2026-05-22T00:00:00.000Z');
    const clock: Clock = { now: () => now };

    const uc = new BackfillMpPayments(
      users,
      cursors,
      gateway,
      batchClassifier,
      transactions,
      summaries,
      prompts,
      refresh,
      clock,
    );

    const result = await uc.execute({ userId: 'u1', scope: '7d' });

    // Payment 1 deduped; payment 3 (account_fund) filtered earlier; total = 2.
    expect(result.totalImported).toBe(2);
    expect(create.mock.calls).toHaveLength(2);

    // Only the fresh payments (2 of them) were passed to classifyBatch.
    expect(classifyBatch.mock.calls).toHaveLength(1);
    expect(classifyBatch.mock.calls[0][0].payments).toHaveLength(2);

    // lowConfidenceCount reflects only the new payments' classifications.
    expect(result.lowConfidenceCount).toBe(1);
  });

  test('skips payments that already have a pending prompt', async () => {
    // Two accepted payments. Neither is yet a transaction, but payment 1
    // already has a `pending` prompt queued by the cron poller — the
    // backfill must NOT re-import it. Only payment 2 is truly fresh.
    const payments: MpPayment[] = [
      payment({ id: 1, operation_type: 'regular_payment', transaction_amount: 250 }),
      payment({ id: 2, operation_type: 'regular_payment', transaction_amount: 500 }),
    ];

    const searchResult: MpPaymentsSearchResult = {
      results: payments,
      truncated: false,
      totalReported: 2,
    };
    const search = mock(async () => searchResult);
    const gateway = { search } as unknown as MpPaymentsSearchGateway;

    // Only payment 2 reaches classification.
    const classifications: Classification[] = [
      { category: 'comida', suggestedDescription: 'Lunch', confidence: 0.9 },
    ];
    const classifyBatch = mock(async () => classifications);
    const batchClassifier = { classifyBatch } as unknown as BatchClassifier;

    const create = mock(async (input: CreateTransactionInput): Promise<Transaction> => ({
      id: `txn_${input.mpPaymentId ?? 'x'}`,
      date: input.date,
      amount: input.amount,
      currency: 'ARS',
      category: input.category,
      description: input.description,
      merchant: input.merchant,
      userId: input.userId,
      direction: input.direction,
      status: input.status ?? 'active',
      statusChangedAt: null,
      source: input.source,
      mpPaymentId: input.mpPaymentId ?? null,
      needsReview: input.needsReview ?? false,
      operationType: input.operationType ?? null,
    }));
    // No pre-existing transactions.
    const findByMpPaymentId = mock(async () => null);
    const transactions = {
      create,
      findByMpPaymentId,
    } as unknown as TransactionsRepository;

    // Payment 1 has a pending prompt; payment 2 does not.
    const pendingPrompt: PendingPrompt = {
      id: 'pp1',
      userId: 'u1',
      mpPaymentId: '1',
      kind: 'expense',
      amount: 250,
      merchant: 'Test Merchant',
      paymentDate: '2026-05-21T18:25:00.000Z',
      suggestedCategory: 'comida',
      suggestedDescription: 'Lunch',
      operationType: 'regular_payment',
      confidence: 0.9,
      intent: 'confirm',
      noticeReason: null,
      status: 'pending',
      resolvedTransactionId: null,
      createdAt: '2026-05-22T00:01:00.000Z',
      resolvedAt: null,
    };
    const promptsFind = mock(async (_userId: string, mpPaymentId: string) =>
      mpPaymentId === '1' ? pendingPrompt : null,
    );
    const prompts = {
      findByMpPaymentId: promptsFind,
    } as unknown as PendingPromptsRepository;

    const createdSummary: BackfillSummary = {
      id: 'sum1',
      userId: 'u1',
      scope: '7d',
      rangeBegin: new Date('2026-05-15T00:00:00.000Z'),
      rangeEnd: new Date('2026-05-22T00:00:00.000Z'),
      totalImported: 1,
      byOperationType: {
        regular_payment: 1,
        money_transfer: 0,
        recurring_payment: 0,
        account_fund: 0,
      },
      lowConfidenceCount: 0,
      truncated: false,
      status: 'visible',
      createdAt: new Date('2026-05-22T00:00:00.000Z'),
    };
    const summariesCreate = mock(async () => createdSummary);
    const summaries = {
      create: summariesCreate,
    } as unknown as BackfillSummariesRepository;

    const cursorUpsert = mock(async () => {});
    const cursors = {
      getByUserId: mock(async () => null),
      upsert: cursorUpsert,
    } satisfies MpPollCursorsRepository;

    const getById = mock(async () => user);
    const users = { getById } as unknown as UsersRepository;

    const refreshExecute = mock(async () => 'tok');
    const refresh = { execute: refreshExecute } as unknown as RefreshMpToken;

    const now = new Date('2026-05-22T00:00:00.000Z');
    const clock: Clock = { now: () => now };

    const uc = new BackfillMpPayments(
      users,
      cursors,
      gateway,
      batchClassifier,
      transactions,
      summaries,
      prompts,
      refresh,
      clock,
    );

    const result = await uc.execute({ userId: 'u1', scope: '7d' });

    // Only payment 2 is imported; payment 1 is left for the user to
    // resolve via the existing pending prompt.
    expect(create.mock.calls).toHaveLength(1);
    expect(result.totalImported).toBe(1);

    // Only the truly fresh payment reached classifyBatch.
    expect(classifyBatch.mock.calls).toHaveLength(1);
    expect(classifyBatch.mock.calls[0][0].payments).toHaveLength(1);
    expect(classifyBatch.mock.calls[0][0].payments[0].id).toBe(2);
  });
});
