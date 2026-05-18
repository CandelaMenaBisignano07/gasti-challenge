import { test, expect } from 'bun:test';
import { PeriodResolver } from './period-resolver';
import type { Clock } from './clock';

const clock: Clock = { now: () => new Date('2026-05-17T12:00:00.000Z') };
const resolver = new PeriodResolver(clock);

test('currentMonth resolves from the 1st to today', () => {
  expect(resolver.resolve({ kind: 'currentMonth' })).toEqual({ from: '2026-05-01', to: '2026-05-17' });
});

test('lastNDays resolves an inclusive N-day window ending today', () => {
  expect(resolver.resolve({ kind: 'lastNDays', n: 7 })).toEqual({ from: '2026-05-11', to: '2026-05-17' });
});

test('month resolves the full calendar month', () => {
  expect(resolver.resolve({ kind: 'month', month: '2026-04' })).toEqual({
    from: '2026-04-01',
    to: '2026-04-30',
  });
});

test('customRange passes the bounds through', () => {
  expect(resolver.resolve({ kind: 'customRange', from: '2026-04-15', to: '2026-05-05' })).toEqual({
    from: '2026-04-15',
    to: '2026-05-05',
  });
});
