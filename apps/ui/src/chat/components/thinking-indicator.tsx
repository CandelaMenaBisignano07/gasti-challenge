import { Eyebrow } from '@/shared/ui/eyebrow';
import { ThinkingDots } from '@/chat/components/thinking-dots';

/** Standalone "Gasti is thinking" block — used before the reply message exists. */
export function ThinkingIndicator() {
  return (
    <article aria-label="Gasti está pensando" className="flex w-full animate-message-enter">
      <div className="flex flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        <ThinkingDots />
      </div>
    </article>
  );
}
