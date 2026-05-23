'use client';

import { useState } from 'react';
import { Card } from '@/shared/ui/card';
import { Eyebrow } from '@/shared/ui/eyebrow';
import { Num } from '@/shared/ui/num';
import { OptionPillStack } from '@/shared/ui/option-pill-stack';
import { useProactive } from '@/proactive/infrastructure/use-proactive';
import { formatPromptDate } from '@/proactive/providers/format-prompt-date';
import { pickLeadCopy } from '@/proactive/providers/pick-lead-copy';
import { PromptEditor } from '@/proactive/components/prompt-editor';
import type { PendingPrompt } from '@/proactive/domain/pending-prompt';

type ProactivePromptCardProps = {
  prompt: PendingPrompt;
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ProactivePromptCard({ prompt }: ProactivePromptCardProps) {
  const { resolve } = useProactive();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // For income with a payer name, surface the real sender (e.g. "Juan Pérez")
  // instead of the generic MP merchant string.
  const counterpart =
    prompt.counterparty ?? prompt.merchant ?? prompt.suggestedDescription;
  const date = formatPromptDate(prompt.paymentDate);
  const { lead, relator } = pickLeadCopy({
    operationType: prompt.operationType,
    direction: prompt.kind,
  });
  const resolved = prompt.status !== 'pending';

  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    void action().finally(() => setBusy(false));
  };

  const onPick = (id: string) => {
    if (id === 'add') run(() => resolve(prompt.id, { action: 'add' }));
    else if (id === 'discard') run(() => resolve(prompt.id, { action: 'discard' }));
    else if (id === 'edit') setEditing((v) => !v);
  };

  return (
    <Card variant="frosted" radius="lg" className="max-w-[540px] p-s4 animate-message-enter">
      <div className="flex flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>

        <p className="font-display text-[17px] leading-[1.5] text-ink-1">
          {lead} <Num value={prompt.amount} size="sm" /> {relator} {counterpart} del{' '}
          {date}. Categoría sugerida: {prompt.suggestedCategory}.
        </p>

        {!resolved && prompt.confidence >= 0.4 && prompt.confidence < 0.7 && (
          <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
            Categoría sugerida
          </span>
        )}

        {!resolved && prompt.confidence < 0.4 && (
          <div className="flex items-center gap-s2">
            <span className="inline-flex items-center rounded-pill bg-warn-soft px-s3 py-[3px] font-display text-[11px] font-medium leading-none tracking-label text-warn">
              {capitalize(prompt.suggestedCategory)}
            </span>
            <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
              Revisalo
            </span>
          </div>
        )}

        {resolved ? (
          <span className="mt-s1 font-display text-[12px] font-medium tracking-label text-ink-3">
            {prompt.status === 'added'
              ? `Agregado como ${capitalize(prompt.suggestedCategory)}`
              : 'Descartado'}
          </span>
        ) : (
          <div className="mt-s2">
            <OptionPillStack
              label="Opciones"
              options={[
                { id: 'add', label: 'Agregar', intent: 'confirm', disabled: busy },
                { id: 'edit', label: 'Editar', disabled: busy },
                { id: 'discard', label: 'Descartar', intent: 'cancel', disabled: busy },
              ]}
              onPick={onPick}
            />
          </div>
        )}

        {!resolved && editing && (
          <PromptEditor
            initialCategory={prompt.suggestedCategory}
            initialDescription={prompt.suggestedDescription}
            merchant={prompt.merchant}
            onConfirm={(value) =>
              run(() =>
                resolve(prompt.id, {
                  action: 'add',
                  overrides: {
                    category: value.category,
                    description: value.description,
                    rememberMerchantCategory: value.rememberMerchantCategory,
                  },
                }),
              )
            }
          />
        )}
      </div>
    </Card>
  );
}
