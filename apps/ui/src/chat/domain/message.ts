import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

export type Locale = 'es' | 'en';

export type ToolCall = {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
};

export type OptionPill = {
  id: string;
  label: string;
  intent?: 'confirm' | 'cancel';
};

export type MessageAttachment =
  | { kind: 'transactionList'; items: Transaction[] }
  | { kind: 'budgetProgress'; progress: BudgetProgress; captionEs?: string }
  | { kind: 'optionPills'; options: OptionPill[]; resolved?: boolean };

export type UserMessage = {
  id: string;
  role: 'user';
  locale: Locale;
  text: string;
  sentAt: string;
};

export type GastiMessage = {
  id: string;
  role: 'gasti';
  locale: Locale;
  text: string;
  toolCalls?: ToolCall[];
  attachments?: MessageAttachment[];
  sentAt: string;
};

export type Message = UserMessage | GastiMessage;
