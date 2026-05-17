'use client';

import { useEffect } from 'react';
import { UserMessage } from '@/chat/components/user-message';
import { GastiMessage } from '@/chat/components/gasti-message';
import { ThinkingIndicator } from '@/chat/components/thinking-indicator';
import type { Message } from '@/chat/domain/message';

type ConversationThreadProps = {
  messages: Message[];
  pending?: boolean;
};

export function ConversationThread({ messages, pending = false }: ConversationThreadProps) {
  // Keep the view pinned to the bottom of the history whenever it grows.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: reduced ? 'auto' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length, pending]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      className="flex flex-col gap-s7 py-s6"
    >
      {messages.map((m) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} message={m} />
        ) : (
          <GastiMessage key={m.id} message={m} />
        ),
      )}
      {pending && <ThinkingIndicator />}
    </div>
  );
}
