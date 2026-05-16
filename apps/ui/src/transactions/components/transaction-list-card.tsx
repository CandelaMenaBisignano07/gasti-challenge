import { Card } from '@/shared/ui/card';
import { TransactionRow } from '@/transactions/components/transaction-row';
import type { Transaction } from '@/transactions/domain/transaction';

type TransactionListCardProps = {
  items: Transaction[];
};

export function TransactionListCard({ items }: TransactionListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      <ul className="divide-y divide-line-1 [&>li]:pl-[62px] [&>li:first-child]:pl-0">
        {items.map((t, i) => (
          <li key={t.id} className={i === 0 ? '' : 'relative'}>
            {/* The pl-[62px] on parent is intentionally undone for the row's left edge using a negative margin trick;
                instead we render the row natively and let the divider be visible only beneath the right column.
                Implementation: keep each row at its natural padding; render dividers as a border-top on each non-first <li>. */}
            <div className={i === 0 ? '' : 'border-t border-line-1 ml-[62px] -mr-s3'} aria-hidden />
            <TransactionRow transaction={t} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
