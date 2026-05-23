import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import { BarMeter } from '@/shared/ui/bar-meter';
import { capitalize } from '@/shared/format/capitalize';
import { resolveBudgetFraction, resolveBudgetTone } from '@/budgets/providers/budget-state';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

type BudgetProgressCardProps = {
  progress: BudgetProgress;
  caption?: string; // e.g. "Proyectado: $58.000 a fin de mes"
};

export function BudgetProgressCard({ progress, caption }: BudgetProgressCardProps) {
  const tone = resolveBudgetTone(progress);
  const fraction = resolveBudgetFraction(progress);
  const label = capitalize(progress.category);

  return (
    <Card variant="lavender" radius="lg" className="p-s4 px-s5">
      <div className="flex items-baseline justify-between">
        <div className="font-display text-[16px] font-semibold text-ink-1">{label}</div>
        <div className="flex items-baseline gap-s2">
          <Num value={progress.spent} size="sm" />
          <span className="font-display text-[12px] tracking-label text-ink-3">/</span>
          <Num value={progress.budget} size="sm" />
        </div>
      </div>
      <div className="mt-s3">
        <BarMeter value={fraction} tone={tone} ariaLabel={`Progreso de ${label}`} />
      </div>
      {caption && (
        <div className="mt-s2 font-display text-[12px] font-medium tracking-label text-ink-3">
          {caption}
        </div>
      )}
    </Card>
  );
}
