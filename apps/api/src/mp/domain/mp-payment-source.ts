import type { MpPayment } from './mp-payment';

export const MP_PAYMENT_SOURCE = 'MP_PAYMENT_SOURCE';

/** Fetches full Mercado Pago payment details for a webhook event. */
export interface MpPaymentSource {
  // `userId` is a forward-looking hook for the multi-tenant data model; the
  // single-user app currently resolves the account via `users.getCurrent()`.
  getById(paymentId: string, userId: string): Promise<MpPayment>;
}
