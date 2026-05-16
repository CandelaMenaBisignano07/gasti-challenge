import { Eyebrow } from '@/shared/ui/eyebrow';
import { MessageAttachments } from '@/chat/components/message-attachments';
import { ToolCallTrace } from '@/chat/components/tool-call-trace';
import type { GastiMessage as GastiMessageEntity } from '@/chat/domain/message';

type GastiMessageProps = {
  message: GastiMessageEntity;
};

export function GastiMessage({ message }: GastiMessageProps) {
  return (
    <article aria-label="Gasti" className="flex w-full">
      <div className="flex max-w-[540px] flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        <p className="whitespace-pre-wrap font-display text-[17px] leading-[1.5] text-ink-1">
          {message.text}
        </p>
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} />
        )}
        {message.toolCalls && message.toolCalls.length > 0 && <ToolCallTrace calls={message.toolCalls} />}
      </div>
    </article>
  );
}
