import type { MpPayment } from './mp-payment';

// TODO Phase 6: replace with the TransactionStatus exported from shared/domain/transaction.ts
export type TransactionStatus = 'active' | 'refunded' | 'charged_back';

/** Maps a Mercado Pago payment status to our internal transaction status. */
export const mapMpStatusToTransactionStatus = (s: MpPayment['status']): TransactionStatus => {
  if (s === 'refunded') return 'refunded';
  if (s === 'charged_back') return 'charged_back';
  return 'active';
};
