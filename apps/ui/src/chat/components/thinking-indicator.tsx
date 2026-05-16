import { Eyebrow } from '@/shared/ui/eyebrow';

const DOT_DELAYS = [0, 150, 300];

export function ThinkingIndicator() {
  return (
    <article aria-label="Gasti está pensando" className="flex w-full animate-message-enter">
      <div className="flex flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        <div className="flex items-center gap-s2" aria-hidden="true">
          {DOT_DELAYS.map((delay) => (
            <span
              key={delay}
              className="h-[7px] w-[7px] rounded-pill bg-ai-ink animate-thinking-dot"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
