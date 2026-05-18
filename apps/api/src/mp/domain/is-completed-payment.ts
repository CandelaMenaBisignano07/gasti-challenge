import type { MpPayment } from './mp-payment';

/** A payment is "completed" once approved, accredited, and captured. */
export const isCompletedPayment = (p: MpPayment): boolean =>
  p.status === 'approved' && p.status_detail === 'accredited' && p.captured !== false;
