'use client';

import { OptionPillStack } from '@/shared/ui/option-pill-stack';
import { TransactionListCard } from '@/transactions/components/transaction-list-card';
import { BudgetProgressCard } from '@/budgets/components/budget-progress-card';
import { useChat } from '@/chat/infrastructure/use-chat';
import type { Locale, MessageAttachment } from '@/chat/domain/message';

type MessageAttachmentsProps = {
  attachments: MessageAttachment[];
  locale: Locale;
};

export function MessageAttachments({ attachments, locale }: MessageAttachmentsProps) {
  const { pickOption } = useChat();

  return (
    <div className="mt-s3 flex flex-col gap-s3">
      {attachments.map((a, idx) => {
        if (a.kind === 'transactionList') {
          return <TransactionListCard key={idx} items={a.items} locale={locale} />;
        }
        if (a.kind === 'budgetProgress') {
          return <BudgetProgressCard key={idx} progress={a.progress} captionEs={a.captionEs} />;
        }
        if (a.kind === 'optionPills') {
          const options = a.options.map((o) => ({ ...o, disabled: a.resolved }));
          return <OptionPillStack key={idx} options={options} onPick={(id) => void pickOption(id)} />;
        }
        return null;
      })}
    </div>
  );
}
