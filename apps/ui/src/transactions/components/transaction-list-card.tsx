import { Card } from '@/shared/ui/card';
import { TransactionRow } from '@/transactions/components/transaction-row';
import type { Transaction } from '@/transactions/domain/transaction';

type TransactionListCardProps = {
  items: Transaction[];
};

export function TransactionListCard({ items }: TransactionListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      <ul>
        {items.map((t, i) => (
          <li key={t.id}>
            {/* Inset divider above every row but the first — aligned to start
                under the text column, not under the leading icon. */}
            {i > 0 && <div className="border-t border-line-1 ml-[62px] -mr-s3" aria-hidden />}
            <TransactionRow transaction={t} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
