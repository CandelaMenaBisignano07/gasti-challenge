'use client';

import { OptionPillStack } from '@/shared/ui/option-pill-stack';
import { TransactionListCard } from '@/transactions/components/transaction-list-card';
import { BudgetProgressCard } from '@/budgets/components/budget-progress-card';
import { StatCard } from '@/shared/ui/stat-card';
import { RankedListCard } from '@/shared/ui/ranked-list-card';
import { CompareListCard } from '@/shared/ui/compare-list-card';
import { BulletListCard } from '@/shared/ui/bullet-list-card';
import { useChat } from '@/chat/infrastructure/use-chat';
import type { MessageAttachment } from '@/chat/domain/message';

type MessageAttachmentsProps = {
  attachments: MessageAttachment[];
};

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const { pickOption } = useChat();

  return (
    <div className="mt-s3 flex flex-col gap-s3">
      {attachments.map((a, idx) => {
        if (a.kind === 'transactionList') {
          return <TransactionListCard key={idx} items={a.items} />;
        }
        if (a.kind === 'budgetProgress') {
          return <BudgetProgressCard key={idx} progress={a.progress} caption={a.caption} />;
        }
        if (a.kind === 'optionPills') {
          const options = a.options.map((o) => ({ ...o, disabled: a.resolved }));
          return (
            <OptionPillStack
              key={idx}
              options={options}
              caption={a.caption}
              onPick={(id) => void pickOption(id)}
            />
          );
        }
        if (a.kind === 'stat') {
          return <StatCard key={idx} label={a.label} value={a.value} caption={a.caption} tone={a.tone} />;
        }
        if (a.kind === 'rankedList') {
          return <RankedListCard key={idx} title={a.title} items={a.items} />;
        }
        if (a.kind === 'compareList') {
          return (
            <CompareListCard
              key={idx}
              title={a.title}
              periodA={a.periodA}
              periodB={a.periodB}
              rows={a.rows}
            />
          );
        }
        if (a.kind === 'bulletList') {
          return <BulletListCard key={idx} title={a.title} items={a.items} />;
        }
        return null;
      })}
    </div>
  );
}
