'use client';

import { Coins, LineChart, Receipt, Wallet } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { SuggestionChip } from '@/shared/ui/suggestion-chip';
import { useChat } from '@/chat/infrastructure/use-chat';

const SUGGESTIONS = [
  { icon: Wallet,    label: '¿Cuánto gasté en comida este mes?' },
  { icon: Receipt,   label: 'Mostrame los gastos de los últimos 30 días.' },
  { icon: Coins,     label: '¿En qué gasté más esta semana?' },
  { icon: LineChart, label: 'Proyectá cómo termina el mes.' },
] as const;

export function LandingHero() {
  const { sendMessage } = useChat();

  return (
    <div className="flex w-full flex-col items-center gap-s7 px-s4 pt-s10">
      <Card
        variant="frosted"
        radius="xl"
        className="w-full max-w-[640px] px-s6 py-s8 animate-message-enter"
      >
        <h1 className="font-display text-[44px] font-bold leading-[1.04] tracking-tight text-ink-1">
          Tu <span style={{ color: 'var(--ai-violet-ink)' }}>asistente financiero</span> conversacional.
        </h1>
        <p className="editorial mt-s4 text-[22px] leading-[1.25] text-ink-2">
          Preguntale sobre tus gastos — te responde en una oración.
        </p>
      </Card>

      <div className="flex w-full max-w-[640px] flex-col gap-s3">
        {SUGGESTIONS.map((s, i) => (
          <div
            key={s.label}
            className="animate-message-enter"
            style={{ animationDelay: `${90 + i * 70}ms` }}
          >
            <SuggestionChip
              icon={s.icon}
              label={s.label}
              onClick={() => void sendMessage(s.label)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
