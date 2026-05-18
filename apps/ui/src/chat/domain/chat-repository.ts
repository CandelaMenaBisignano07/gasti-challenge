import type { Conversation } from '@/chat/domain/conversation';
import type { GastiMessage, Message, ToolCall } from '@/chat/domain/message';

export type ReplyEvent =
  | { kind: 'thinking' }
  | { kind: 'toolCall'; call: ToolCall }
  | { kind: 'partial'; text: string }
  | { kind: 'final'; message: GastiMessage };

export interface ChatRepository {
  loadInitial(): Promise<Conversation>;
  reply(input: { text: string; history: Message[] }): AsyncIterable<ReplyEvent>;
  confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent>;
}
