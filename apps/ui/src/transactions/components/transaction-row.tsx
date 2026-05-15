import { CategoryIcon } from '@/shared/icons/category-icon';
import { Num } from '@/shared/ui/num';
import { formatTransactionDate } from '@/transactions/providers/date-formatter';
import type { Transaction } from '@/transactions/domain/transaction';
import type { Locale } from '@/chat/domain/message';

type TransactionRowProps = {
  transaction: Transaction;
  locale?: Locale;
};

export function TransactionRow({ transaction, locale = 'es' }: TransactionRowProps) {
  const { amount, category, merchant, date } = transaction;

  return (
    <div className="flex items-center gap-s3 px-s3 py-s3">
      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-surface-tint text-ai-ink">
        <CategoryIcon category={category} size={20} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="truncate font-display text-[15px] font-semibold text-ink-1">{merchant}</div>
        <div className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {formatTransactionDate(date, locale)}
        </div>
      </div>

      <div className="flex flex-col items-end">
        <Num value={amount} size="sm" signed />
        <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </span>
      </div>
    </div>
  );
}
