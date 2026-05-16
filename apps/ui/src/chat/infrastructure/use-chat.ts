'use client';

import { useContext } from 'react';
import { ChatContext, type ChatContextValue } from '@/chat/infrastructure/chat-context';

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
