import { Card } from '@/shared/ui/card';
import { Pill } from '@/shared/ui/pill';
import type { UserMessage as UserMessageEntity } from '@/chat/domain/message';

type UserMessageProps = {
  message: UserMessageEntity;
};

export function UserMessage({ message }: UserMessageProps) {
  const label = 'Vos';
  return (
    <article aria-label={label} className="flex w-full justify-end animate-message-enter">
      <div className="flex max-w-[480px] flex-col items-end gap-s2">
        <Pill tone="ai">{label}</Pill>
        <Card variant="plain" elevation={1} radius="lg" className="px-s4 py-s3">
          <p className="whitespace-pre-wrap font-display text-[15px] leading-[1.5] text-ink-1">{message.text}</p>
        </Card>
      </div>
    </article>
  );
}
