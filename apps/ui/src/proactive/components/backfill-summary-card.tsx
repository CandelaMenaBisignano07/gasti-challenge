'use client';

import { Card } from '@/shared/ui/card';
import { Eyebrow } from '@/shared/ui/eyebrow';
import type { BackfillRunSummary } from '@/mp/domain/mp-connection';

type BackfillSummaryCardProps = {
  summary: BackfillRunSummary;
  onDismiss: () => void;
};

export function BackfillSummaryCard({ summary, onDismiss }: BackfillSummaryCardProps) {
  const { byOperationType } = summary;

  return (
    <Card variant="frosted" radius="lg" className="max-w-[540px] p-s4">
      <Eyebrow tone="ai">Gasti</Eyebrow>
      <p className="mt-s2 font-display text-[17px] leading-[1.5] text-ink-1">
        Importé <strong>{summary.totalImported} movimientos</strong> de tu Mercado Pago.
      </p>

      {summary.totalImported > 0 && (
        <ul className="mt-s2 list-disc pl-s4 font-display text-[14px] text-ink-2 space-y-s1">
          {byOperationType.regular_payment > 0 && (
            <li>{byOperationType.regular_payment} pagos a comercios</li>
          )}
          {byOperationType.money_transfer > 0 && (
            <li>{byOperationType.money_transfer} transferencias</li>
          )}
          {byOperationType.recurring_payment > 0 && (
            <li>{byOperationType.recurring_payment} pagos recurrentes</li>
          )}
          {summary.lowConfidenceCount > 0 && (
            <li className="text-warn">
              {summary.lowConfidenceCount} quedaron en &quot;otros&quot; para revisar
            </li>
          )}
          {summary.truncated && (
            <li className="text-ink-3">
              Mostramos los más recientes; los movimientos antiguos no se importaron
            </li>
          )}
        </ul>
      )}

      <div className="mt-s4 flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-pill bg-ai px-s4 py-s2 font-display text-[14px] text-white"
        >
          Listo
        </button>
      </div>
    </Card>
  );
}
