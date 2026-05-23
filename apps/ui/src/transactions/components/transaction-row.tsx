import { CategoryIcon } from '@/shared/icons/category-icon';
import { Num } from '@/shared/ui/num';
import { formatTransactionDate } from '@/transactions/providers/date-formatter';
import type {
  Transaction,
  TransactionOperationType,
  TransactionStatus,
} from '@/transactions/domain/transaction';

type TransactionRowProps = {
  transaction: Transaction;
};

const STATUS_LABEL: Record<TransactionStatus, string> = {
  active: '',
  refunded: 'Reembolsada',
  charged_back: 'Contracargo',
};

const OPERATION_LABEL: Record<TransactionOperationType, string> = {
  regular_payment: '',
  money_transfer: 'Transferencia',
  recurring_payment: 'Recurrente',
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function TransactionRow({ transaction }: TransactionRowProps) {
  const {
    amount,
    category,
    merchant,
    date,
    description,
    direction = 'expense',
    status = 'active',
    source,
    operationType,
    needsReview,
    counterparty,
  } = transaction;

  // For income, the "title line" is the actual remitter (e.g. "Juan Pérez")
  // when we captured it; falls back to the merchant string otherwise.
  const isIncome = direction === 'income';
  const titleLine = isIncome && counterparty ? counterparty : merchant;

  // Hide description when it duplicates the title — common after backfill,
  // since the classifier often reuses the merchant as a fallback description.
  const showDescription =
    description && description.trim() !== titleLine.trim() && description.trim() !== merchant.trim();
  const statusLabel = STATUS_LABEL[status];
  const operationLabel = operationType ? OPERATION_LABEL[operationType] : '';

  return (
    <div className="flex items-start gap-s3 px-s3 py-s3">
      <span className="mt-[2px] flex h-9 w-9 items-center justify-center rounded-sm bg-surface-tint text-ai-ink">
        <CategoryIcon category={category} size={20} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-s2">
          <span className="truncate font-display text-[15px] font-semibold text-ink-1">
            {titleLine}
          </span>
          {needsReview && (
            <span className="inline-flex items-center rounded-pill bg-warn-soft px-s2 py-[2px] font-display text-[10px] font-medium leading-none tracking-label text-warn">
              Revisar
            </span>
          )}
          {statusLabel && (
            <span className="inline-flex items-center rounded-pill bg-neg/10 px-s2 py-[2px] font-display text-[10px] font-medium leading-none tracking-label text-neg">
              {statusLabel}
            </span>
          )}
        </div>

        {showDescription && (
          <div className="truncate font-display text-[13px] text-ink-2">{description}</div>
        )}

        <div className="mt-[2px] flex items-center gap-s2 font-display text-[12px] font-medium tracking-label text-ink-3">
          <span>{formatTransactionDate(date)}</span>
          {source === 'mercadopago' && <span aria-hidden>·</span>}
          {source === 'mercadopago' && <span>Mercado Pago</span>}
          {operationLabel && <span aria-hidden>·</span>}
          {operationLabel && <span>{operationLabel}</span>}
        </div>
      </div>

      <div className="flex flex-col items-end">
        {isIncome ? (
          <Num value={amount} size="sm" delta />
        ) : (
          <Num value={amount} size="sm" />
        )}
        <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {capitalize(category)}
        </span>
      </div>
    </div>
  );
}
