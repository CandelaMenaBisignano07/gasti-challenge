import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Message } from '@/chat/domain/message';

type Deps = {
  repo: ChatRepository;
};

export type ConfirmEvent =
  | { kind: 'resolvePrevOptions' }
  | ReplyEvent;

export function makeConfirmMutation({ repo }: Deps) {
  return async function* confirmMutation(req: { optionId: string; history: Message[] }): AsyncIterable<ConfirmEvent> {
    yield { kind: 'resolvePrevOptions' };
    for await (const ev of repo.confirmOption({ optionId: req.optionId, history: req.history })) {
      yield ev;
    }
  };
}
