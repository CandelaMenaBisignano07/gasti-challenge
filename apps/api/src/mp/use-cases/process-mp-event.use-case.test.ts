import { test, expect } from 'bun:test';
import { ProcessMpEvent } from './process-mp-event.use-case';
import { UpdateTransactionStatus } from '../../transactions/use-cases/update-transaction-status.use-case';
import { fakeTransactionsRepo, fixedClock } from '../../shared/testing/fakes';
import type { User } from '../../users/domain/user';
import type { MpPayment } from '../domain/mp-payment';
import type { ClassifyArgs, PaymentClassifier } from '../domain/payment-classifier';
import type { Classification } from '../domain/classification';
import type { PendingPrompt } from '../../proactive/domain/pending-prompt';
import type {
  NewPendingPrompt,
  PendingPromptsRepository,
} from '../../proactive/domain/pending-prompts.repository';
import type { ProactiveEventBus } from '../../proactive/domain/proactive-event-bus';
import type { Transaction } from '../../shared/domain/transaction';

const MP_USER_ID = '12345';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'default-user',
    displayName: null,
    languagePref: null,
    mpUserId: MP_USER_ID,
    mpAccessToken: null,
    mpRefreshToken: null,
    mpTokenExpiresAt: null,
    mpScope: null,
    mpLiveMode: null,
    mpConnectedAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function fakeClassifier(verdict?: Classification): {
  classifier: PaymentClassifier;
  calls: ClassifyArgs[];
} {
  const calls: ClassifyArgs[] = [];
  return {
    calls,
    classifier: {
      async classify(args) {
        calls.push(args);
        return (
          verdict ?? { category: 'comida', suggestedDescription: 'Pedido', confidence: 0.9 }
        );
      },
    },
  };
}

function fakePendingPromptsRepo(seed: PendingPrompt[] = []): {
  repo: PendingPromptsRepository;
  rows: () => PendingPrompt[];
} {
  let rows: PendingPrompt[] = seed.map((p) => ({ ...p }));
  let n = rows.length;
  return {
    rows: () => rows.map((r) => ({ ...r })),
    repo: {
      async create(p: NewPendingPrompt) {
        const created: PendingPrompt = {
          ...p,
          id: `pp_test_${(n += 1)}`,
          resolvedTransactionId: null,
          resolvedAt: null,
        };
        rows.push(created);
        return { ...created };
      },
      async findByMpPaymentId(userId, mpPaymentId) {
        return (
          rows.find((r) => r.userId === userId && r.mpPaymentId === mpPaymentId) ?? null
        );
      },
      async listPending(userId) {
        return rows.filter((r) => r.userId === userId && r.status === 'pending');
      },
      async getById(userId, id) {
        return rows.find((r) => r.userId === userId && r.id === id) ?? null;
      },
      async markAdded(id, txId) {
        const i = rows.findIndex((r) => r.id === id);
        if (i !== -1) rows[i] = { ...rows[i], status: 'added', resolvedTransactionId: txId };
      },
      async markDiscarded(id, reason) {
        const i = rows.findIndex((r) => r.id === id);
        if (i !== -1)
          rows[i] = { ...rows[i], status: 'discarded', noticeReason: reason ?? null };
      },
    },
  };
}

function fakeBus(): { bus: ProactiveEventBus; published: PendingPrompt[] } {
  const published: PendingPrompt[] = [];
  return {
    published,
    bus: {
      publish(_userId, prompt) {
        published.push(prompt);
      },
      subscribe() {
        return () => {};
      },
    },
  };
}

function makePayment(overrides: Partial<MpPayment> = {}): MpPayment {
  return {
    id: 'PAY_1',
    status: 'approved',
    status_detail: 'accredited',
    captured: true,
    operation_type: 'regular_payment',
    transaction_amount: 12500,
    description: 'Compra Rappi #88231',
    date_approved: '2026-05-14T10:00:00.000Z',
    date_created: '2026-05-14T09:59:00.000Z',
    collector_id: 99999,
    payer: { first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com' },
    additional_info: { items: [{ title: 'Rappi' }] },
    ...overrides,
  };
}

function makePrompt(overrides: Partial<PendingPrompt> = {}): PendingPrompt {
  return {
    id: 'p_1',
    userId: 'default-user',
    mpPaymentId: 'PAY_1',
    kind: 'expense',
    amount: 12500,
    merchant: 'Rappi',
    paymentDate: '2026-05-14T10:00:00.000Z',
    suggestedCategory: 'comida',
    suggestedDescription: 'Pedido Rappi',
    operationType: 'regular_payment',
    confidence: 0.9,
    intent: 'confirm',
    noticeReason: null,
    status: 'pending',
    resolvedTransactionId: null,
    createdAt: '2026-05-14T10:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_001',
    date: '2026-05-14',
    amount: 12500,
    currency: 'ARS',
    category: 'comida',
    description: 'Pedido Rappi',
    merchant: 'Rappi',
    userId: 'default-user',
    direction: 'expense',
    status: 'active',
    statusChangedAt: null,
    source: 'mercadopago',
    mpPaymentId: 'PAY_1',
    ...overrides,
  };
}

function build(opts: {
  user: User;
  payment: MpPayment;
  txs?: Transaction[];
  prompts?: PendingPrompt[];
  verdict?: Classification;
}) {
  const txRepo = fakeTransactionsRepo(opts.txs ?? []);
  const promptsRepo = fakePendingPromptsRepo(opts.prompts ?? []);
  const bus = fakeBus();
  const classifier = fakeClassifier(opts.verdict);
  const fakeUserLookup = { lookupNickname: async () => null };
  const useCase = new ProcessMpEvent(
    classifier.classifier,
    txRepo,
    promptsRepo.repo,
    bus.bus,
    fakeUserLookup,
    new UpdateTransactionStatus(txRepo, fixedClock('2026-05-18')),
    fixedClock('2026-05-18'),
  );
  return {
    useCase,
    txRepo,
    promptsRepo,
    bus,
    classifier,
    user: opts.user,
    payment: opts.payment,
  };
}

test('Branch 3: new completed payment → classifier called → confirm prompt published', async () => {
  const { useCase, promptsRepo, bus, classifier, user, payment } = build({
    user: makeUser(),
    payment: makePayment(),
  });

  await useCase.execute({ payment, user });

  expect(classifier.calls).toHaveLength(1);
  expect(classifier.calls[0].kind).toBe('expense');
  expect(classifier.calls[0].amount).toBe(12500);

  const rows = promptsRepo.rows();
  expect(rows).toHaveLength(1);
  expect(rows[0].intent).toBe('confirm');
  expect(rows[0].status).toBe('pending');
  expect(rows[0].mpPaymentId).toBe('PAY_1');
  expect(rows[0].suggestedCategory).toBe('comida');
  expect(rows[0].amount).toBe(12500);

  expect(bus.published).toHaveLength(1);
  expect(bus.published[0].id).toBe(rows[0].id);
});

test('Branch 3: income when collector_id matches the user mpUserId', async () => {
  const { useCase, promptsRepo, classifier, user, payment } = build({
    user: makeUser(),
    payment: makePayment({ collector_id: Number(MP_USER_ID) }),
  });

  await useCase.execute({ payment, user });

  expect(classifier.calls[0].kind).toBe('income');
  expect(promptsRepo.rows()[0].kind).toBe('income');
});

test('Branch 1: reversal of an existing tx → updateStatus + auto/notice prompt + published', async () => {
  const { useCase, txRepo, promptsRepo, bus, user, payment } = build({
    user: makeUser(),
    payment: makePayment({ status: 'refunded', status_detail: 'refunded' }),
    txs: [makeTx()],
  });

  await useCase.execute({ payment, user });

  const tx = await txRepo.getById('default-user', 'txn_001');
  expect(tx?.status).toBe('refunded');
  expect(tx?.statusChangedAt).not.toBeNull();

  const rows = promptsRepo.rows();
  expect(rows).toHaveLength(1);
  expect(rows[0].intent).toBe('notice');
  expect(rows[0].status).toBe('auto');
  expect(rows[0].noticeReason).toBe('mp_refund');
  expect(rows[0].mpPaymentId).toBe('PAY_1:reversal');

  expect(bus.published).toHaveLength(1);
  expect(bus.published[0].intent).toBe('notice');
});

test('Branch 1: chargeback maps noticeReason to mp_chargeback', async () => {
  const { useCase, promptsRepo, user, payment } = build({
    user: makeUser(),
    payment: makePayment({ status: 'charged_back', status_detail: 'charged_back' }),
    txs: [makeTx()],
  });

  await useCase.execute({ payment, user });

  expect(promptsRepo.rows()[0].noticeReason).toBe('mp_chargeback');
});

test('Branch 1: idempotent — same status as existing tx → drop, nothing published', async () => {
  const { useCase, promptsRepo, bus, user, payment } = build({
    user: makeUser(),
    payment: makePayment({ status: 'approved' }),
    txs: [makeTx({ status: 'active' })],
  });

  await useCase.execute({ payment, user });

  expect(promptsRepo.rows()).toHaveLength(0);
  expect(bus.published).toHaveLength(0);
});

test('Branch 2: refund before prompt shown → markDiscarded + published', async () => {
  const { useCase, promptsRepo, bus, user, payment } = build({
    user: makeUser(),
    payment: makePayment({ status: 'refunded', status_detail: 'refunded' }),
    prompts: [makePrompt()],
  });

  await useCase.execute({ payment, user });

  const rows = promptsRepo.rows();
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('discarded');
  expect(rows[0].noticeReason).toBe('mp_refund');

  expect(bus.published).toHaveLength(1);
  expect(bus.published[0].status).toBe('discarded');
});

test('Branch 2: not completed and no pending prompt → drop', async () => {
  const { useCase, promptsRepo, bus, user, payment } = build({
    user: makeUser(),
    payment: makePayment({ status: 'in_process', status_detail: 'pending' }),
  });

  await useCase.execute({ payment, user });

  expect(promptsRepo.rows()).toHaveLength(0);
  expect(bus.published).toHaveLength(0);
});

test('Idempotency: duplicate mpPaymentId already pending → no second prompt', async () => {
  const { useCase, promptsRepo, bus, classifier, user, payment } = build({
    user: makeUser(),
    payment: makePayment(),
    prompts: [makePrompt()],
  });

  await useCase.execute({ payment, user });

  expect(promptsRepo.rows()).toHaveLength(1);
  expect(bus.published).toHaveLength(0);
  expect(classifier.calls).toHaveLength(0);
});
