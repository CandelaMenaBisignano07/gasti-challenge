import { test, expect } from 'bun:test';
import { InMemoryProactiveEventBus } from './in-memory-proactive-event-bus';
import type { PendingPrompt } from '../domain/pending-prompt';
import type { BackfillSummary } from '../domain/backfill-summary';

function makePrompt(id: string): PendingPrompt {
  return {
    id,
    userId: 'u1',
    mpPaymentId: `PAY-${id}`,
    kind: 'expense',
    amount: 1000,
    merchant: 'Rappi',
    paymentDate: '2026-05-18T00:00:00.000Z',
    suggestedCategory: 'comida',
    suggestedDescription: 'Pedido',
    confidence: 0.8,
    intent: 'confirm',
    noticeReason: null,
    status: 'pending',
    resolvedTransactionId: null,
    createdAt: '2026-05-18T00:00:00.000Z',
    resolvedAt: null,
  };
}

test('delivers a published prompt to a subscriber of the same user', () => {
  const bus = new InMemoryProactiveEventBus();
  const received: string[] = [];
  bus.subscribe('u1', (p) => received.push(p.id));
  bus.publish('u1', makePrompt('a'));
  expect(received).toEqual(['a']);
});

test('does not deliver across users', () => {
  const bus = new InMemoryProactiveEventBus();
  const received: string[] = [];
  bus.subscribe('u1', (p) => received.push(p.id));
  bus.publish('u2', makePrompt('a'));
  expect(received).toHaveLength(0);
});

test('unsubscribe stops further delivery', () => {
  const bus = new InMemoryProactiveEventBus();
  const received: string[] = [];
  const off = bus.subscribe('u1', (p) => received.push(p.id));
  bus.publish('u1', makePrompt('a'));
  off();
  bus.publish('u1', makePrompt('b'));
  expect(received).toEqual(['a']);
});

test('a handler subscribing during dispatch does not receive the in-flight event', () => {
  const bus = new InMemoryProactiveEventBus();
  const late: string[] = [];
  bus.subscribe('u1', () => {
    bus.subscribe('u1', (p) => late.push(p.id));
  });
  bus.publish('u1', makePrompt('a')); // late subscriber added mid-dispatch
  expect(late).toHaveLength(0);
  bus.publish('u1', makePrompt('b')); // now it receives
  expect(late).toEqual(['b']);
});

function makeSummary(id: string): BackfillSummary {
  return {
    id,
    userId: 'u1',
    scope: '7d',
    rangeBegin: new Date('2026-05-15T00:00:00.000Z'),
    rangeEnd: new Date('2026-05-22T00:00:00.000Z'),
    totalImported: 3,
    byOperationType: {
      regular_payment: 2,
      money_transfer: 1,
      recurring_payment: 0,
      account_fund: 0,
    },
    lowConfidenceCount: 1,
    truncated: false,
    status: 'visible',
    createdAt: new Date('2026-05-22T00:00:00.000Z'),
  };
}

test('publishes backfill summaries to backfill subscribers of the same user', () => {
  const bus = new InMemoryProactiveEventBus();
  const received: string[] = [];
  bus.subscribeBackfillSummaries('u1', (s) => received.push(s.id));
  bus.publishBackfillSummary('u1', makeSummary('s1'));
  expect(received).toEqual(['s1']);
});

test('backfill summaries are isolated from the prompts channel', () => {
  const bus = new InMemoryProactiveEventBus();
  const prompts: string[] = [];
  const summaries: string[] = [];
  bus.subscribe('u1', (p) => prompts.push(p.id));
  bus.subscribeBackfillSummaries('u1', (s) => summaries.push(s.id));

  bus.publish('u1', makePrompt('p1'));
  bus.publishBackfillSummary('u1', makeSummary('s1'));

  expect(prompts).toEqual(['p1']);
  expect(summaries).toEqual(['s1']);
});
