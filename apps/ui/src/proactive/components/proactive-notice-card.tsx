'use client';

import type { ReactNode } from 'react';
import { Card } from '@/shared/ui/card';
import { Eyebrow } from '@/shared/ui/eyebrow';
import { Num } from '@/shared/ui/num';
import { formatPromptDate } from '@/proactive/providers/format-prompt-date';
import type {
  PendingPrompt,
  PendingPromptNoticeReason,
} from '@/proactive/domain/pending-prompt';

type ProactiveNoticeCardProps = {
  prompt: PendingPrompt;
};

export function ProactiveNoticeCard({ prompt }: ProactiveNoticeCardProps) {
  if (!prompt.noticeReason) return null;

  const counterpart = prompt.merchant ?? prompt.suggestedDescription;
  const date = formatPromptDate(prompt.paymentDate);
  const noun = prompt.operationType === 'money_transfer' ? 'transferencia' : 'pago';
  const amount = <Num value={prompt.amount} size="sm" />;

  const copy: Record<PendingPromptNoticeReason, { primary: ReactNode; secondary: string }> = {
    mp_refund: {
      primary: (
        <>
          Mercado Pago reembolsó tu {noun} a {counterpart} del {date} ({amount}). La marcamos como
          reembolsada.
        </>
      ),
      secondary: `Tu total de ${prompt.suggestedCategory} bajó automáticamente.`,
    },
    mp_chargeback: {
      primary: (
        <>
          Mercado Pago revirtió tu {noun} a {counterpart} del {date} ({amount}) por un contracargo.
        </>
      ),
      secondary: 'Esa transacción ya no cuenta en tus totales.',
    },
    mp_cancellation: {
      primary: (
        <>
          Mercado Pago canceló tu {noun} a {counterpart} del {date} ({amount}). La marcamos como
          cancelada.
        </>
      ),
      secondary: 'Esa transacción quedó cancelada en tus totales.',
    },
    mp_chargeback_reimbursed: {
      primary: (
        <>
          Mercado Pago resolvió el contracargo a tu favor. Tu {noun} a {counterpart} del {date} (
          {amount}) vuelve a contar.
        </>
      ),
      secondary: `Tu total de ${prompt.suggestedCategory} se restauró automáticamente.`,
    },
  };

  const { primary, secondary } = copy[prompt.noticeReason];

  return (
    <Card variant="lavender" radius="lg" className="max-w-[540px] p-s4 animate-message-enter">
      <div className="flex flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        <p className="font-display text-[17px] leading-[1.5] text-ink-1">{primary}</p>
        <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {secondary}
        </span>
      </div>
    </Card>
  );
}
