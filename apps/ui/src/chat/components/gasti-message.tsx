import { Eyebrow } from '@/shared/ui/eyebrow';
import { MessageAttachments } from '@/chat/components/message-attachments';
import { ToolCallTrace } from '@/chat/components/tool-call-trace';
import { ThinkingDots } from '@/chat/components/thinking-dots';
import type { GastiMessage as GastiMessageEntity } from '@/chat/domain/message';

type GastiMessageProps = {
  message: GastiMessageEntity;
};

export function GastiMessage({ message }: GastiMessageProps) {
  return (
    <article aria-label="Gasti" className="flex w-full animate-message-enter">
      <div className="flex max-w-[540px] flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        {/* While the reply is streaming in (tool calls running, no text yet)
            the thinking dots stand in for the text, above the tool-call trace. */}
        {message.text ? (
          <p className="whitespace-pre-wrap font-display text-[17px] leading-[1.5] text-ink-1">
            {message.text}
          </p>
        ) : (
          <ThinkingDots />
        )}
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} />
        )}
        {message.toolCalls && message.toolCalls.length > 0 && <ToolCallTrace calls={message.toolCalls} />}
      </div>
    </article>
  );
}
