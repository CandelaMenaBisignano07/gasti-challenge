'use client';

import { useEffect, useRef } from 'react';
import { UserMessage } from '@/chat/components/user-message';
import { GastiMessage } from '@/chat/components/gasti-message';
import type { Message } from '@/chat/domain/message';

type ConversationThreadProps = {
  messages: Message[];
};

export function ConversationThread({ messages }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

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
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
