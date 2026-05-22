import { test, expect } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { ResolveProactivePrompt } from './resolve-proactive-prompt.use-case';
import { AddTransaction, type AddTransactionInput } from '../../transactions/use-cases/add.use-case';
import { OverrideMerchantCategory } from '../../categorization/use-cases/override-merchant.use-case';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';
import type { User } from '../../users/domain/user';
import type { UsersRepository } from '../../users/domain/users.repository';
import type { PendingPrompt } from '../domain/pending-prompt';
import type {
  NewPendingPrompt,
  PendingPromptsRepository,
} from '../domain/pending-prompts.repository';
import type { OverrideMerchantInput } from '../../categorization/use-cases/override-merchant.use-case';
import type { Transaction } from '../../shared/domain/transaction';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'default-user',
    displayName: null,
    languagePref: null,
    mpUserId: null,
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

function fakeUsersRepo(user: User): UsersRepository {
  return {
    async getCurrent() {
      return user;
    },
    async findByMpUserId() {
      return null;
    },
    async linkMpAccount() {},
    async updateMpTokens() {},
    async unlinkMpAccount() {},
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

function fakeAddTransaction(): { useCase: AddTransaction; calls: AddTransactionInput[] } {
  const calls: AddTransactionInput[] = [];
  const useCase = {
    async execute(input: AddTransactionInput): Promise<{ transaction: Transaction }> {
      calls.push(input);
      const tx: Transaction = {
        id: 'txn_999',
        date: input.date ?? '2026-05-14',
        amount: input.amount,
        currency: 'ARS',
        category: input.category ?? 'otros',
        description: input.description,
        merchant: input.merchant,
        userId: input.userId ?? 'default-user',
        direction: input.direction ?? 'expense',
        status: 'active',
        statusChangedAt: null,
        source: input.source ?? 'manual',
        mpPaymentId: input.mpPaymentId ?? null,
        needsReview: false,
        operationType: null,
      };
      return { transaction: tx };
    },
  } as unknown as AddTransaction;
  return { useCase, calls };
}

function fakeOverrideMerchant(): {
  useCase: OverrideMerchantCategory;
  calls: OverrideMerchantInput[];
} {
  const calls: OverrideMerchantInput[] = [];
  const useCase = {
    async execute(input: OverrideMerchantInput) {
      calls.push(input);
      return input;
    },
  } as unknown as OverrideMerchantCategory;
  return { useCase, calls };
}

function build(opts: { prompts?: PendingPrompt[]; user?: User } = {}) {
  const promptsRepo = fakePendingPromptsRepo(opts.prompts ?? []);
  const add = fakeAddTransaction();
  const override = fakeOverrideMerchant();
  const currentUser = new CurrentUserProvider(fakeUsersRepo(opts.user ?? makeUser()));
  const useCase = new ResolveProactivePrompt(
    promptsRepo.repo,
    add.useCase,
    override.useCase,
    currentUser,
  );
  return { useCase, promptsRepo, add, override };
}

test('add without overrides → AddTransaction gets mp_webhook source, kind direction, mpPaymentId', async () => {
  const { useCase, promptsRepo, add } = build({ prompts: [makePrompt()] });

  const result = await useCase.execute({ promptId: 'p_1', action: 'add' });

  expect(add.calls).toHaveLength(1);
  expect(add.calls[0].source).toBe('mp_webhook');
  expect(add.calls[0].direction).toBe('expense');
  expect(add.calls[0].mpPaymentId).toBe('PAY_1');
  expect(add.calls[0].amount).toBe(12500);
  expect(add.calls[0].category).toBe('comida');
  expect(add.calls[0].description).toBe('Pedido Rappi');
  expect(add.calls[0].merchant).toBe('Rappi');
  expect(add.calls[0].date).toBe('2026-05-14');
  expect(add.calls[0].userId).toBe('default-user');

  expect(result.transaction?.id).toBe('txn_999');
  expect(result.prompt.status).toBe('added');
  expect(result.prompt.resolvedTransactionId).toBe('txn_999');
  expect(promptsRepo.rows()[0].status).toBe('added');
});

test('add with category + description overrides → overridden values persisted', async () => {
  const { useCase, add } = build({ prompts: [makePrompt()] });

  await useCase.execute({
    promptId: 'p_1',
    action: 'add',
    overrides: { category: 'transporte', description: 'Viaje al centro' },
  });

  expect(add.calls[0].category).toBe('transporte');
  expect(add.calls[0].description).toBe('Viaje al centro');
});

test('add with rememberMerchantCategory → OverrideMerchantCategory also called', async () => {
  const { useCase, override } = build({ prompts: [makePrompt()] });

  await useCase.execute({
    promptId: 'p_1',
    action: 'add',
    overrides: { category: 'transporte', rememberMerchantCategory: true },
  });

  expect(override.calls).toHaveLength(1);
  expect(override.calls[0].merchant).toBe('Rappi');
  expect(override.calls[0].category).toBe('transporte');
});

test('add with rememberMerchantCategory but no merchant → OverrideMerchantCategory not called', async () => {
  const { useCase, override } = build({
    prompts: [makePrompt({ merchant: null })],
  });

  await useCase.execute({
    promptId: 'p_1',
    action: 'add',
    overrides: { rememberMerchantCategory: true },
  });

  expect(override.calls).toHaveLength(0);
});

test('discard → markDiscarded called, transaction null', async () => {
  const { useCase, promptsRepo, add } = build({ prompts: [makePrompt()] });

  const result = await useCase.execute({ promptId: 'p_1', action: 'discard' });

  expect(add.calls).toHaveLength(0);
  expect(result.transaction).toBeNull();
  expect(result.prompt.status).toBe('discarded');
  expect(promptsRepo.rows()[0].status).toBe('discarded');
});

test('already-resolved prompt → idempotent, nothing created', async () => {
  const { useCase, add, override } = build({
    prompts: [makePrompt({ status: 'added', resolvedTransactionId: 'txn_001' })],
  });

  const result = await useCase.execute({ promptId: 'p_1', action: 'add' });

  expect(add.calls).toHaveLength(0);
  expect(override.calls).toHaveLength(0);
  expect(result.transaction).toBeNull();
  expect(result.prompt.status).toBe('added');
});

test('unknown promptId → throws NotFoundException', async () => {
  const { useCase } = build({ prompts: [] });

  await expect(useCase.execute({ promptId: 'missing', action: 'add' })).rejects.toBeInstanceOf(
    NotFoundException,
  );
});
