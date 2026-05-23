import type { OperationType } from './operation-type';

/** Minimal local shape of a Mercado Pago payment — only the fields we read. */
export interface MpPayment {
  id: number | string;
  status:
    | 'pending'
    | 'approved'
    | 'authorized'
    | 'in_process'
    | 'in_mediation'
    | 'rejected'
    | 'canceled'
    | 'refunded'
    | 'charged_back';
  status_detail: string;
  captured?: boolean;
  /**
   * MP's classification of the movement (regular_payment, money_transfer,
   * recurring_payment, account_fund, ...). May be missing on older payloads.
   */
  operation_type?: OperationType | null;
  transaction_amount: number;
  description?: string | null;
  date_approved?: string | null;
  date_created?: string | null;
  collector_id?: number | null;
  /**
   * Recipient block. MP returns this on outgoing payments (you paid someone);
   * the user-facing fields (name, email) are usually null for privacy, but
   * `id` lets us look up the public nickname via `/users/{id}`.
   */
  collector?: {
    id?: number | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  payer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  additional_info?: { items?: Array<{ title?: string }> | null } | null;
}
