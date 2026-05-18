import type { MpPayment } from './mp-payment';

export const MP_PAYMENT_SOURCE = 'MP_PAYMENT_SOURCE';

/** Fetches full Mercado Pago payment details for a webhook event. */
export interface MpPaymentSource {
  getById(paymentId: string, userId: string): Promise<MpPayment>;
}
