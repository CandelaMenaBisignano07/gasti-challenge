import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Conversation } from '@/chat/domain/conversation';
import type { Message } from '@/chat/domain/message';
import { getThreadId, RESOURCE_ID } from '@/chat/infrastructure/chat-session';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function errorFinal(): ReplyEvent {
  return {
    kind: 'final',
    message: {
      id: makeId(),
      role: 'gasti',
      text: 'No pude conectarme con Gasti en este momento. Probá de nuevo en un rato.',
      sentAt: new Date().toISOString(),
    },
  };
}

/**
 * Resolves the natural-language text for a picked option pill. The agent has no
 * concept of pills — confirming a mutation is just the user's next text turn.
 */
function resolveOptionLabel(optionId: string, history: Message[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'gasti' || !m.attachments) continue;
    for (const a of m.attachments) {
      if (a.kind !== 'optionPills') continue;
      const option = a.options.find((o) => o.id === optionId);
      if (option) return option.label;
    }
  }
  return optionId === 'cancel' ? 'Cancelar' : 'Sí, confirmá';
}

export class AgentChatRepository implements ChatRepository {
  async loadInitial(): Promise<Conversation> {
    return { id: 'conv-1', messages: [], startedAt: new Date().toISOString() };
  }

  reply(input: { text: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    return this.#stream(input.text);
  }

  confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    return this.#stream(resolveOptionLabel(input.optionId, input.history));
  }

  async *#stream(text: string): AsyncIterable<ReplyEvent> {
    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, threadId: getThreadId(), resourceId: RESOURCE_ID }),
      });
    } catch {
      yield errorFinal();
      return;
    }

    if (!response.ok || !response.body) {
      yield errorFinal();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) yield JSON.parse(line) as ReplyEvent;
        }
      }
      if (buffer.trim()) yield JSON.parse(buffer) as ReplyEvent;
    } catch {
      yield errorFinal();
    } finally {
      // Release the body if the consumer abandons the generator mid-stream.
      reader.cancel().catch(() => {});
    }
  }
}
