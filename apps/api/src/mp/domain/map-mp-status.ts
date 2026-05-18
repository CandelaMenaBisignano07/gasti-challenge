import type { MpPayment } from './mp-payment';
import type { TransactionStatus } from '../../shared/domain/transaction';

/** Maps a Mercado Pago payment status to our internal transaction status. */
export const mapMpStatusToTransactionStatus = (s: MpPayment['status']): TransactionStatus => {
  if (s === 'refunded') return 'refunded';
  if (s === 'charged_back') return 'charged_back';
  return 'active';
};
