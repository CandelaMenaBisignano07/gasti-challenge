'use client';

import { Eyebrow } from '@/shared/ui/eyebrow';
import type { ToolCall } from '@/chat/domain/message';

type ToolCallTraceProps = {
  calls: ToolCall[];
};

export function ToolCallTrace({ calls }: ToolCallTraceProps) {
  if (!calls || calls.length === 0) return null;

  return (
    <details className="group mt-s3 select-none">
      <summary className="flex cursor-pointer list-none items-center gap-s3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai">
        <Eyebrow tone="ink">Tools</Eyebrow>
        <div className="flex flex-wrap gap-s2">
          {calls.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center rounded-pill border border-line-1 bg-surface-0 px-s3 py-[3px] font-mono text-[12px] text-ink-2"
            >
              {c.name}
            </span>
          ))}
        </div>
      </summary>
      <div className="mt-s3 rounded-md bg-surface-tint p-s3">
        {calls.map((c) => (
          <pre
            key={c.id}
            className="overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.4] text-ink-2"
          >{`${c.name}(${JSON.stringify(c.inputs, null, 2)})`}</pre>
        ))}
      </div>
    </details>
  );
}
