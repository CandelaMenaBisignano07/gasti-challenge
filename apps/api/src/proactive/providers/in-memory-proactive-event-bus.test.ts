import { test, expect } from 'bun:test';
import { InMemoryProactiveEventBus } from './in-memory-proactive-event-bus';
import type { PendingPrompt } from '../domain/pending-prompt';

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
    operationType: 'regular_payment',
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
