import { describe, expect, test } from 'bun:test';
import { pickLeadCopy } from './pick-lead-copy';

describe('pickLeadCopy', () => {
  test('regular_payment + income', () => {
    expect(pickLeadCopy({ operationType: 'regular_payment', direction: 'income' })).toEqual({
      lead: 'Te llegaron', relator: 'de',
    });
  });
  test('regular_payment + expense', () => {
    expect(pickLeadCopy({ operationType: 'regular_payment', direction: 'expense' })).toEqual({
      lead: 'Pagaste', relator: 'a',
    });
  });
  test('money_transfer + income', () => {
    expect(pickLeadCopy({ operationType: 'money_transfer', direction: 'income' })).toEqual({
      lead: 'Te transfirieron', relator: 'de',
    });
  });
  test('money_transfer + expense', () => {
    expect(pickLeadCopy({ operationType: 'money_transfer', direction: 'expense' })).toEqual({
      lead: 'Transferiste', relator: 'a',
    });
  });
  test('recurring_payment + expense', () => {
    expect(pickLeadCopy({ operationType: 'recurring_payment', direction: 'expense' })).toEqual({
      lead: 'Pago recurrente', relator: 'de',
    });
  });
  test('recurring_payment + income falls back to regular income copy', () => {
    expect(pickLeadCopy({ operationType: 'recurring_payment', direction: 'income' })).toEqual({
      lead: 'Te llegaron', relator: 'de',
    });
  });
});
