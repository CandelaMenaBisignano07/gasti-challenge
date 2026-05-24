import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import type { CompareRow } from '@/chat/domain/message';

type CompareListCardProps = {
  title?: string;
  periodA: string;
  periodB: string;
  rows: CompareRow[];
};

export function CompareListCard({ title, periodA, periodB, rows }: CompareListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      {title && (
        <div className="px-s4 pt-s3 font-display text-[12px] font-medium tracking-label text-ink-3">
          {title}
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-s3 px-s4 py-s2 font-display text-[11px] font-medium tracking-label text-ink-3">
        <span></span>
        <span className="text-right">{periodA}</span>
        <span className="text-right">{periodB}</span>
        <span className="text-right">Δ</span>
      </div>
      <ul>
        {rows.map((row, i) => (
          <li key={`${row.label}-${i}`}>
            {i > 0 && <div className="border-t border-line-1 mx-s4" aria-hidden />}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-s3 px-s4 py-s3">
              <span className="truncate font-display text-[14px] font-semibold text-ink-1">
                {row.label}
              </span>
              <Num value={row.a} size="sm" className="text-right" />
              <Num value={row.b} size="sm" className="text-right" />
              <Num value={row.deltaPct} size="sm" delta percent className="text-right" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
