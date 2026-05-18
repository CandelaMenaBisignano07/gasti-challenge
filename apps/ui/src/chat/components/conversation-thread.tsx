'use client';

import { useEffect, useMemo } from 'react';
import { UserMessage } from '@/chat/components/user-message';
import { GastiMessage } from '@/chat/components/gasti-message';
import { ThinkingIndicator } from '@/chat/components/thinking-indicator';
import { ProactivePromptCard } from '@/proactive/components/proactive-prompt-card';
import { ProactiveNoticeCard } from '@/proactive/components/proactive-notice-card';
import { useProactive } from '@/proactive/infrastructure/use-proactive';
import type { Message } from '@/chat/domain/message';
import type { PendingPrompt } from '@/proactive/domain/pending-prompt';

type ConversationThreadProps = {
  messages: Message[];
  pending?: boolean;
};

type ThreadItem =
  | { type: 'message'; at: number; message: Message }
  | { type: 'prompt'; at: number; prompt: PendingPrompt };

export function ConversationThread({ messages, pending = false }: ConversationThreadProps) {
  const { prompts } = useProactive();

  // Interleave chat messages and proactive cards in chronological order.
  const items = useMemo<ThreadItem[]>(() => {
    const merged: ThreadItem[] = [
      ...messages.map(
        (message): ThreadItem => ({
          type: 'message',
          at: new Date(message.sentAt).getTime(),
          message,
        }),
      ),
      ...prompts.map(
        (prompt): ThreadItem => ({
          type: 'prompt',
          at: new Date(prompt.createdAt).getTime(),
          prompt,
        }),
      ),
    ];
    return merged.sort((a, b) => a.at - b.at);
  }, [messages, prompts]);

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
  }, [items.length, pending]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      className="flex flex-col gap-s7 py-s6"
    >
      {items.map((item) => {
        if (item.type === 'message') {
          return item.message.role === 'user' ? (
            <UserMessage key={`message:${item.message.id}`} message={item.message} />
          ) : (
            <GastiMessage key={`message:${item.message.id}`} message={item.message} />
          );
        }
        return item.prompt.intent === 'notice' ? (
          <ProactiveNoticeCard key={`prompt:${item.prompt.id}`} prompt={item.prompt} />
        ) : (
          <ProactivePromptCard key={`prompt:${item.prompt.id}`} prompt={item.prompt} />
        );
      })}
      {pending && <ThinkingIndicator />}
    </div>
  );
}
