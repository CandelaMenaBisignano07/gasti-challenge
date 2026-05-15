import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Locale, Message, UserMessage } from '@/chat/domain/message';

export type DispatchedEvent =
  | { kind: 'appendUser'; message: UserMessage }
  | ReplyEvent;

type Deps = {
  repo: ChatRepository;
  detectLocale: (text: string) => Locale;
  now?: () => Date;
  makeId?: () => string;
};

export function makeSendUserMessage({ repo, detectLocale, now = () => new Date(), makeId = defaultId }: Deps) {
  return async function* sendUserMessage(req: { text: string; history: Message[] }): AsyncIterable<DispatchedEvent> {
    const trimmed = req.text.trim();
    if (!trimmed) return;

    const locale = detectLocale(trimmed);
    const userMessage: UserMessage = {
      id: makeId(),
      role: 'user',
      locale,
      text: trimmed,
      sentAt: now().toISOString(),
    };
    yield { kind: 'appendUser', message: userMessage };

    for await (const ev of repo.reply({ text: trimmed, locale, history: [...req.history, userMessage] })) {
      yield ev;
    }
  };
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
