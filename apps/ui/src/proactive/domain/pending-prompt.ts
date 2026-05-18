export type PendingPromptKind = 'income' | 'expense';
export type PendingPromptIntent = 'confirm' | 'notice';
export type PendingPromptNoticeReason = 'mp_refund' | 'mp_chargeback';
export type PendingPromptStatus = 'pending' | 'added' | 'discarded' | 'auto';

export type PendingPrompt = {
  id: string;
  userId: string;
  mpPaymentId: string;
  kind: PendingPromptKind;
  amount: number;
  merchant: string | null;
  paymentDate: string;
  suggestedCategory: string;
  suggestedDescription: string;
  confidence: number;
  intent: PendingPromptIntent;
  noticeReason: PendingPromptNoticeReason | null;
  status: PendingPromptStatus;
  resolvedTransactionId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
