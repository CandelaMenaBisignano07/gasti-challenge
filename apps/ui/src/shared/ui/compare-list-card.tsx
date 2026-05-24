import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import type { CompareRow } from '@/chat/domain/message';

type CompareListCardProps = {
  title?: string;
  periodA: string;
  periodB: string;
  rows: CompareRow[];
};

const HEAD_CELL =
  'px-s3 py-s2 font-display text-[11px] font-semibold uppercase tracking-label text-ink-3 whitespace-nowrap';
const BODY_NUM_CELL = 'px-s3 py-s3 text-right tabular-nums';

export function CompareListCard({ title, periodA, periodB, rows }: CompareListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      {title && (
        <div className="px-s4 pt-s3 pb-s2 font-display text-[12px] font-medium tracking-label text-ink-3">
          {title}
        </div>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface-tint border-y border-line-2">
            <th className={`${HEAD_CELL} text-left pl-s4`}>Categoría</th>
            <th className={`${HEAD_CELL} text-right border-l border-line-2`}>{periodA}</th>
            <th className={`${HEAD_CELL} text-right border-l border-line-2`}>{periodB}</th>
            <th className={`${HEAD_CELL} text-right border-l border-line-2 pr-s4`}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.label}-${i}`} className={i > 0 ? 'border-t border-line-2' : ''}>
              <td className="truncate px-s4 py-s3 font-display text-[14px] font-semibold text-ink-1">
                {row.label}
              </td>
              <td className={`${BODY_NUM_CELL} border-l border-line-2`}>
                <Num value={row.a} size="sm" />
              </td>
              <td className={`${BODY_NUM_CELL} border-l border-line-2`}>
                <Num value={row.b} size="sm" />
              </td>
              <td className={`${BODY_NUM_CELL} border-l border-line-2 pr-s4`}>
                <Num value={row.deltaPct} size="sm" delta percent />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
