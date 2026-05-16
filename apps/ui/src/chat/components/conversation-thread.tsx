'use client';

import { useEffect, useRef } from 'react';
import { UserMessage } from '@/chat/components/user-message';
import { GastiMessage } from '@/chat/components/gasti-message';
import { ThinkingIndicator } from '@/chat/components/thinking-indicator';
import type { Message } from '@/chat/domain/message';

type ConversationThreadProps = {
  messages: Message[];
  pending?: boolean;
};

export function ConversationThread({ messages, pending = false }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
