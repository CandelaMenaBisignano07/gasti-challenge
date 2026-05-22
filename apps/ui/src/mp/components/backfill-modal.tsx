'use client';

import { useState } from 'react';
import { Card } from '@/shared/ui/card';
import { OptionPillStack } from '@/shared/ui/option-pill-stack';
import { useMpConnection } from '@/mp/infrastructure/use-mp-connection';
import type { BackfillRunSummary, BackfillScope } from '@/mp/domain/mp-connection';

type Choice = BackfillScope | 'skip';

type BackfillModalProps = {
  onDone: (summary: BackfillRunSummary | null) => void;
};

export function BackfillModal({ onDone }: BackfillModalProps) {
  const [choice, setChoice] = useState<Choice>('skip');
  const [phase, setPhase] = useState<'choose' | 'running'>('choose');
  const [error, setError] = useState<string | null>(null);
  const { triggerBackfill } = useMpConnection();

  const submit = async () => {
    setError(null);
    if (choice === 'skip') {
      onDone(null);
      return;
    }
    setPhase('running');
    try {
      const result = await triggerBackfill(choice);
      onDone(result);
    } catch (e) {
      setError((e as Error).message);
      setPhase('choose');
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-s4">
      <Card variant="frosted" radius="lg" className="w-full max-w-[460px] p-s5">
        <h2 className="font-display text-[18px] font-medium text-ink-1">
          ¿Importamos tus pagos recientes?
        </h2>
        <p className="mt-s2 font-display text-[14px] text-ink-2">
          Podés traer un rango histórico o arrancar limpio. Después aparece todo en el chat.
        </p>

        <div className="mt-s4">
          <OptionPillStack
            label="Rango"
            selectedId={choice}
            onPick={(id) => setChoice(id as Choice)}
            options={[
              { id: 'skip', label: 'Ahora no' },
              { id: '24h', label: 'Últimas 24 horas' },
              { id: '7d', label: 'Última semana' },
              { id: '15d', label: 'Últimos 15 días' },
              { id: '30d', label: 'Último mes' },
            ]}
          />
        </div>

        {error && (
          <p className="mt-s2 font-display text-[12px] text-warn">
            {error}
          </p>
        )}

        <div className="mt-s4 flex justify-end">
          <button
            type="button"
            disabled={phase === 'running'}
            onClick={submit}
            className="rounded-pill bg-ai px-s4 py-s2 font-display text-[14px] text-white disabled:opacity-50"
          >
            {phase === 'running' ? 'Trayendo…' : 'Continuar'}
          </button>
        </div>
      </Card>
    </div>
  );
}
