'use client';

import { Card } from '@/shared/ui/card';
import { Eyebrow } from '@/shared/ui/eyebrow';
import { Num } from '@/shared/ui/num';
import { formatPromptDate } from '@/proactive/providers/format-prompt-date';
import type { PendingPrompt } from '@/proactive/domain/pending-prompt';

type ProactiveNoticeCardProps = {
  prompt: PendingPrompt;
};

export function ProactiveNoticeCard({ prompt }: ProactiveNoticeCardProps) {
  const counterpart = prompt.merchant ?? prompt.suggestedDescription;
  const date = formatPromptDate(prompt.paymentDate);
  const isRefund = prompt.noticeReason === 'mp_refund';

  return (
    <Card variant="lavender" radius="lg" className="max-w-[540px] p-s4 animate-message-enter">
      <div className="flex flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>

        <p className="font-display text-[17px] leading-[1.5] text-ink-1">
          {isRefund ? (
            <>
              Mercado Pago reembolsó tu pago a {counterpart} del {date} (
              <Num value={prompt.amount} size="sm" />
              ). La marcamos como reembolsada.
            </>
          ) : (
            <>
              Mercado Pago revirtió tu pago a {counterpart} del {date} (
              <Num value={prompt.amount} size="sm" />
              ) por un contracargo.
            </>
          )}
        </p>

        <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {isRefund
            ? `Tu total de ${prompt.suggestedCategory} bajó automáticamente.`
            : 'Esa transacción ya no cuenta en tus totales.'}
        </span>
      </div>
    </Card>
  );
}
