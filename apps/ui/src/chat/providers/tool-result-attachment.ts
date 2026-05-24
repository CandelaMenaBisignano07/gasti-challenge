import type {
  BulletItem,
  CompareRow,
  MessageAttachment,
  RankedItem,
} from '@/chat/domain/message';
import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

/** Coerces an unknown value to a string, defaulting to ''. */
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Coerces an unknown value to a record, defaulting to {}. */
export const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const ATTACHMENT_KINDS = new Set([
  'transactionList',
  'budgetProgress',
  'optionPills',
  'stat',
  'rankedList',
  'compareList',
  'bulletList',
]);

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralMovements(n: number): string {
  return `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;
}

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
    case 'sumSpendByCategory': {
      const count = num(r.transactionCount);
      if (count === 0) return null;
      return {
        kind: 'stat',
        label: capitalize(str(r.category)),
        value: num(r.total),
        caption: pluralMovements(count),
      };
    }
    case 'projectMonthEnd': {
      const daysElapsed = num(r.daysElapsed);
      const daysInMonth = num(r.daysInMonth);
      const caveat = typeof r.caveat === 'string' && r.caveat ? r.caveat : null;
      return {
        kind: 'stat',
        label: 'Proyección de fin de mes',
        value: num(r.projectedTotal),
        caption: caveat ?? `Día ${daysElapsed} de ${daysInMonth}`,
      };
    }
    case 'getSpendingBreakdown': {
      const breakdown = Array.isArray(r.breakdown)
        ? (r.breakdown as Array<Record<string, unknown>>)
        : [];
      if (breakdown.length === 0) return null;
      const items: RankedItem[] = breakdown.map((b) => ({
        label: capitalize(str(b.category)),
        value: num(b.total),
        share: typeof b.share === 'number' ? b.share : undefined,
        icon: str(b.category),
      }));
      return { kind: 'rankedList', items };
    }
    case 'getTopMerchants': {
      const merchants = Array.isArray(r.merchants)
        ? (r.merchants as Array<Record<string, unknown>>)
        : [];
      if (merchants.length === 0) return null;
      const items: RankedItem[] = merchants.map((m) => {
        const count = num(m.transactionCount);
        return {
          label: str(m.merchant),
          value: num(m.total),
          sub: `${count} ${count === 1 ? 'mov.' : 'movs.'}`,
        };
      });
      return { kind: 'rankedList', items };
    }
    case 'compareSpending': {
      const cats = Array.isArray(r.categories)
        ? (r.categories as Array<Record<string, unknown>>)
        : [];
      if (cats.length === 0) return null;
      const rows: CompareRow[] = cats.map((c) => ({
        label: capitalize(str(c.category)),
        a: num(c.totalA),
        b: num(c.totalB),
        delta: num(c.delta),
        deltaPct: num(c.deltaPct),
      }));
      return {
        kind: 'compareList',
        periodA: str(r.labelA) || 'A',
        periodB: str(r.labelB) || 'B',
        rows,
      };
    }
    case 'detectCategorySpikes': {
      const spikes = Array.isArray(r.spikes)
        ? (r.spikes as Array<Record<string, unknown>>)
        : [];
      if (spikes.length === 0) return null;
      const rows: CompareRow[] = spikes.map((sp) => ({
        label: capitalize(str(sp.category)),
        a: num(sp.priorTotal),
        b: num(sp.currentTotal),
        delta: num(sp.delta),
        deltaPct: num(sp.deltaPct),
      }));
      return { kind: 'compareList', periodA: 'Mes anterior', periodB: 'Este mes', rows };
    }
    case 'detectRecurringCharges': {
      const recurring = Array.isArray(r.recurring)
        ? (r.recurring as Array<Record<string, unknown>>)
        : [];
      if (recurring.length === 0) return null;
      const items: BulletItem[] = recurring.map((re) => {
        const occ = num(re.occurrences);
        return {
          label: str(re.merchant),
          sub: `${capitalize(str(re.cadence))} · ${occ} cargo${occ === 1 ? '' : 's'}`,
          value: num(re.typicalAmount),
          icon: str(re.category),
        };
      });
      return { kind: 'bulletList', items };
    }
    case 'listCategories': {
      const cats = Array.isArray(r.categories)
        ? (r.categories as Array<Record<string, unknown>>)
        : [];
      if (cats.length === 0) return null;
      const items: BulletItem[] = cats.map((c) => {
        const description = str(c.description);
        const isCustom = c.isCustom === true;
        return {
          label: capitalize(str(c.name)),
          sub: description || (isCustom ? 'Categoría personalizada' : 'Sin descripción'),
          icon: str(c.name),
        };
      });
      return { kind: 'bulletList', items };
    }
    default:
      return null;
  }
}
