import type { Message } from '@/chat/domain/message';

export type Conversation = {
  id: string;
  messages: Message[];
  startedAt: string;
};
