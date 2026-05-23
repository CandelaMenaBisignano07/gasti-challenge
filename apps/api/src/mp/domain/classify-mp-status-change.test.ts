import { test, expect } from 'bun:test';
import { classifyMpStatusChange } from './classify-mp-status-change';
import type { MpPayment } from './mp-payment';

function payment(overrides: Partial<MpPayment>): MpPayment {
  return {
    id: 'PAY_1',
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 100,
    ...overrides,
  };
}

test('refunded maps to refunded notice', () => {
  const result = classifyMpStatusChange(payment({ status: 'refunded', status_detail: 'refunded' }));
  expect(result).toEqual({
    newTransactionStatus: 'refunded',
    newStatusDetail: 'refunded',
    noticeReason: 'mp_refund',
    invalidatesPrompt: true,
  });
});

test('canceled maps to canceled notice, regardless of detail', () => {
  for (const detail of ['expired', 'by_payer', 'by_collector', 'canceled_by_api']) {
    const result = classifyMpStatusChange(payment({ status: 'canceled', status_detail: detail }));
    expect(result).toEqual({
      newTransactionStatus: 'canceled',
      newStatusDetail: detail,
      noticeReason: 'mp_cancellation',
      invalidatesPrompt: true,
    });
  }
});

test('charged_back + in_process maps to chargeback notice', () => {
  const result = classifyMpStatusChange(
    payment({ status: 'charged_back', status_detail: 'in_process' }),
  );
  expect(result).toEqual({
    newTransactionStatus: 'charged_back',
    newStatusDetail: 'in_process',
    noticeReason: 'mp_chargeback',
    invalidatesPrompt: true,
  });
});

test('charged_back + settled maps to chargeback notice', () => {
  const result = classifyMpStatusChange(
    payment({ status: 'charged_back', status_detail: 'settled' }),
  );
  expect(result?.newStatusDetail).toBe('settled');
  expect(result?.noticeReason).toBe('mp_chargeback');
});

test('charged_back + reimbursed flips back to active with reimbursed notice', () => {
  const result = classifyMpStatusChange(
    payment({ status: 'charged_back', status_detail: 'reimbursed' }),
  );
  expect(result).toEqual({
    newTransactionStatus: 'active',
    newStatusDetail: 'reimbursed',
    noticeReason: 'mp_chargeback_reimbursed',
    invalidatesPrompt: false,
  });
});

test.each(['pending', 'in_process', 'authorized', 'in_mediation', 'rejected', 'approved'] as const)(
  'returns null for non-reversible status %s',
  (status) => {
    expect(classifyMpStatusChange(payment({ status }))).toBeNull();
  },
);
