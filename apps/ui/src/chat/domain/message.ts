import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

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

export type StatTone = 'neutral' | 'caution' | 'over';

export type RankedItem = {
  label: string;
  value: number;
  share?: number; // 0..1; renders a share bar when set
  sub?: string;
  icon?: string; // category name; falls back to a generic tag
};

export type CompareRow = {
  label: string;
  a: number;
  b: number;
  delta: number;
  deltaPct: number; // signed; "+12,5%" / "−4,1%"
};

export type BulletItem = {
  label: string;
  sub?: string;
  value?: number;
  icon?: string;
};

export type MessageAttachment =
  | { kind: 'transactionList'; items: Transaction[] }
  | { kind: 'budgetProgress'; progress: BudgetProgress; caption?: string }
  | { kind: 'optionPills'; options: OptionPill[]; resolved?: boolean; caption?: string }
  | { kind: 'stat'; label: string; value: number; caption?: string; tone?: StatTone }
  | { kind: 'rankedList'; title?: string; items: RankedItem[] }
  | { kind: 'compareList'; title?: string; periodA: string; periodB: string; rows: CompareRow[] }
  | { kind: 'bulletList'; title?: string; items: BulletItem[] };

export type UserMessage = {
  id: string;
  role: 'user';
  text: string;
  sentAt: string;
};

export type GastiMessage = {
  id: string;
  role: 'gasti';
  text: string;
  toolCalls?: ToolCall[];
  attachments?: MessageAttachment[];
  sentAt: string;
};

export type Message = UserMessage | GastiMessage;
