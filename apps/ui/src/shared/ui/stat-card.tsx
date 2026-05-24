import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import type { StatTone } from '@/chat/domain/message';

type StatCardProps = {
  label: string;
  value: number;
  caption?: string;
  tone?: StatTone;
};

const VALUE_TONE_CLASS: Record<StatTone, string> = {
  neutral: '',
  caution: 'text-warn',
  over: 'text-neg',
};

export function StatCard({ label, value, caption, tone = 'neutral' }: StatCardProps) {
  return (
    <Card variant="plain" radius="lg" className="p-s4 px-s5">
      <div className="font-display text-[12px] font-medium tracking-label text-ink-3">{label}</div>
      <div className="mt-s2">
        <Num value={value} size="xl" className={VALUE_TONE_CLASS[tone]} />
      </div>
      {caption && (
        <div className="mt-s2 font-display text-[12px] font-medium tracking-label text-ink-3">
          {caption}
        </div>
      )}
    </Card>
  );
}
