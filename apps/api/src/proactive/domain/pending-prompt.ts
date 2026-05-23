import type { Category } from '../../shared/domain/category';

export type PaymentKind = 'income' | 'expense';
export type PendingPromptStatus = 'pending' | 'added' | 'discarded' | 'auto';
export type ProactiveIntent = 'confirm' | 'notice';
export type NoticeReason =
  | 'mp_refund'
  | 'mp_chargeback'
  | 'mp_cancellation'
  | 'mp_chargeback_reimbursed';

export interface PendingPrompt {
  readonly id: string;
  readonly userId: string;
  readonly mpPaymentId: string;
  readonly kind: PaymentKind;
  readonly amount: number;
  readonly merchant: string | null;
  /** Human-readable payer name for income prompts. Null for expenses
   *  (merchant already conveys it) and legacy rows. */
  readonly counterparty: string | null;
  readonly paymentDate: string; // ISO
  readonly suggestedCategory: Category;
  readonly suggestedDescription: string;
  readonly operationType: 'regular_payment' | 'money_transfer' | 'recurring_payment';
  readonly confidence: number;
  readonly intent: ProactiveIntent;
  readonly noticeReason: NoticeReason | null;
  readonly status: PendingPromptStatus;
  readonly resolvedTransactionId: string | null;
  readonly createdAt: string; // ISO
  readonly resolvedAt: string | null; // ISO
}
