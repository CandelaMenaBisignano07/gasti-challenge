const DOT_DELAYS = [0, 150, 300];

/** The three animated "thinking" dots, without any surrounding label. */
export function ThinkingDots() {
  return (
    <div className="flex items-center gap-s2" aria-hidden="true">
      {DOT_DELAYS.map((delay) => (
        <span
          key={delay}
          className="h-[7px] w-[7px] rounded-pill bg-ai-ink animate-thinking-dot"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
