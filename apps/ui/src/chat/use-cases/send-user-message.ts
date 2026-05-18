import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Message, UserMessage } from '@/chat/domain/message';

export type DispatchedEvent =
  | { kind: 'appendUser'; message: UserMessage }
  | ReplyEvent;

type Deps = {
  repo: ChatRepository;
  now?: () => Date;
  makeId?: () => string;
};

export function makeSendUserMessage({ repo, now = () => new Date(), makeId = defaultId }: Deps) {
  return async function* sendUserMessage(req: { text: string; history: Message[]; sessionResumed?: boolean }): AsyncIterable<DispatchedEvent> {
    const trimmed = req.text.trim();
    if (!trimmed) return;

    const userMessage: UserMessage = {
      id: makeId(),
      role: 'user',
      text: trimmed,
      sentAt: now().toISOString(),
    };
    yield { kind: 'appendUser', message: userMessage };

    for await (const ev of repo.reply({ text: trimmed, history: [...req.history, userMessage], sessionResumed: req.sessionResumed })) {
      yield ev;
    }
  };
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
