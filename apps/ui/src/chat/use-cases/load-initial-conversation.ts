import type { ChatRepository } from '@/chat/domain/chat-repository';
import type { Conversation } from '@/chat/domain/conversation';

type Deps = { repo: ChatRepository };

export function makeLoadInitialConversation({ repo }: Deps) {
  return function loadInitialConversation(): Promise<Conversation> {
    return repo.loadInitial();
  };
}
