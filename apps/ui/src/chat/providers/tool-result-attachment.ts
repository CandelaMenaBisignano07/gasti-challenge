import type { MessageAttachment } from '@/chat/domain/message';
import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

/** Coerces an unknown value to a string, defaulting to ''. */
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Coerces an unknown value to a record, defaulting to {}. */
export const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const ATTACHMENT_KINDS = new Set(['transactionList', 'budgetProgress', 'optionPills']);

/** A payload that already carries a known attachment `kind` — pass it through. */
function asDisplayAttachment(result: unknown): MessageAttachment | null {
  if (result && typeof result === 'object' && 'kind' in result) {
    const kind = (result as { kind: unknown }).kind;
    if (typeof kind === 'string' && ATTACHMENT_KINDS.has(kind)) {
      return result as MessageAttachment;
    }
  }
  return null;
}

/** Spanish caption stating how many transactions a category change will move. */
function categoryChangeCaption(r: Record<string, unknown>): string {
  const count = typeof r.affectedTransactionCount === 'number' ? r.affectedTransactionCount : 0;
  if (count === 0) return 'Ninguna transacción será afectada.';
  const noun = count === 1 ? 'transacción' : 'transacciones';
  const verb = count === 1 ? 'pasará' : 'pasarán';
  const target = str(r.intent) === 'rename' ? str(r.newName) : 'otros';
  return `${count} ${noun} ${verb} a "${target}".`;
}

/**
 * Maps a tool's result output to a UI attachment. Mastra streams the raw tool
 * output (not the agent's `transform.display` payload), and the same raw output
 * is what gets persisted in memory — so this one mapping serves both the live
 * stream mapper and the history mapper. A gateway error envelope
 * (`{ error: true }`) yields no attachment.
 */
export function toAttachment(toolName: string, result: unknown): MessageAttachment | null {
  const direct = asDisplayAttachment(result);
  if (direct) return direct;

  const r = rec(result);
  if (r.error === true) return null;

  switch (toolName) {
    case 'listTransactions': {
      const items = Array.isArray(r.transactions) ? (r.transactions as Transaction[]) : [];
      return items.length ? { kind: 'transactionList', items } : null;
    }
    case 'getBudgetProgress': {
      const items = Array.isArray(r.items) ? r.items : [];
      const progress = items[0] as BudgetProgress | undefined;
      return progress ? { kind: 'budgetProgress', progress } : null;
    }
    case 'proposeTransactionMutation': {
      const matches = Array.isArray(r.matches) ? (r.matches as Transaction[]) : [];
      const intent = str(r.intent);
      if (matches.length === 1) {
        const confirmLabel = intent === 'delete' ? 'Sí, borralo' : 'Sí, guardá los cambios';
        return {
          kind: 'optionPills',
          options: [
            { id: `confirm:${intent}:${matches[0].id}`, label: confirmLabel, intent: 'confirm' },
            { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
          ],
        };
      }
      return matches.length ? { kind: 'transactionList', items: matches } : null;
    }
    case 'proposeCategoryChange': {
      const intent = str(r.intent);
      if (intent !== 'delete' && intent !== 'rename') return null;
      const name = str(r.name);
      const confirmLabel = intent === 'delete' ? 'Sí, borrala' : 'Sí, renombrala';
      return {
        kind: 'optionPills',
        caption: categoryChangeCaption(r),
        options: [
          { id: `confirm:${intent}:${name}`, label: confirmLabel, intent: 'confirm' },
          { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
        ],
      };
    }
    default:
      return null;
  }
}
