import type { MpPayment } from './mp-payment';
import type { TransactionStatus } from '../../shared/domain/transaction';
import type { NoticeReason } from '../../proactive/domain/pending-prompt';

export interface MpStatusChange {
  readonly newTransactionStatus: TransactionStatus;
  readonly newStatusDetail: string | null;
  readonly noticeReason: NoticeReason;
  /** Whether a pending prompt for this payment should be discarded. */
  readonly invalidatesPrompt: boolean;
}

export const classifyMpStatusChange = (payment: MpPayment): MpStatusChange | null => {
  if (payment.status === 'refunded') {
    return {
      newTransactionStatus: 'refunded',
      newStatusDetail: payment.status_detail,
      noticeReason: 'mp_refund',
      invalidatesPrompt: true,
    };
  }
  if (payment.status === 'canceled') {
    return {
      newTransactionStatus: 'canceled',
      newStatusDetail: payment.status_detail,
      noticeReason: 'mp_cancellation',
      invalidatesPrompt: true,
    };
  }
  if (payment.status === 'charged_back') {
    if (payment.status_detail === 'reimbursed') {
      return {
        newTransactionStatus: 'active',
        newStatusDetail: 'reimbursed',
        noticeReason: 'mp_chargeback_reimbursed',
        invalidatesPrompt: false,
      };
    }
    return {
      newTransactionStatus: 'charged_back',
      newStatusDetail: payment.status_detail,
      noticeReason: 'mp_chargeback',
      invalidatesPrompt: true,
    };
  }
  return null;
};
