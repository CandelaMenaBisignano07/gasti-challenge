import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import { BarMeter } from '@/shared/ui/bar-meter';
import { CategoryIcon } from '@/shared/icons/category-icon';
import type { RankedItem } from '@/chat/domain/message';

type RankedListCardProps = {
  title?: string;
  items: RankedItem[];
};

export function RankedListCard({ title, items }: RankedListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      {title && (
        <div className="px-s4 pt-s3 font-display text-[12px] font-medium tracking-label text-ink-3">
          {title}
        </div>
      )}
      <ul>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {i > 0 && <div className="border-t border-line-1 ml-[62px] -mr-s3" aria-hidden />}
            <div className="flex items-start gap-s3 px-s3 py-s3">
              <span className="mt-[2px] flex h-9 w-9 items-center justify-center rounded-sm bg-surface-tint text-ai-ink">
                <CategoryIcon category={item.icon ?? 'otros'} size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-s2">
                  <span className="truncate font-display text-[15px] font-semibold text-ink-1">
                    {item.label}
                  </span>
                  <Num value={item.value} size="sm" />
                </div>
                {item.sub && (
                  <div className="mt-[2px] font-display text-[12px] font-medium tracking-label text-ink-3">
                    {item.sub}
                  </div>
                )}
                {typeof item.share === 'number' && (
                  <div className="mt-s2">
                    <BarMeter
                      value={item.share}
                      tone="pos"
                      animateOnMount={false}
                      ariaLabel={`Participación de ${item.label}`}
                    />
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
