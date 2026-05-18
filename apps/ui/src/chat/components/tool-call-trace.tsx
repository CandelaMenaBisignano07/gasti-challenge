'use client';

import { useId, useState } from 'react';
import { Eyebrow } from '@/shared/ui/eyebrow';
import type { ToolCall } from '@/chat/domain/message';

type ToolCallTraceProps = {
  calls: ToolCall[];
};

export function ToolCallTrace({ calls }: ToolCallTraceProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (calls.length === 0) return null;

  return (
    <div className="mt-s3 select-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-s3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      >
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
      </button>

      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-slow ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={[
              'mt-s3 rounded-md bg-surface-tint p-s3',
              'transition-opacity duration-slow ease-out',
              open ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            {calls.map((c) => (
              <pre
                key={c.id}
                className="overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.4] text-ink-2"
              >{`${c.name}(${JSON.stringify(c.inputs, null, 2)})`}</pre>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
