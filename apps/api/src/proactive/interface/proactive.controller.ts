import { Body, Controller, Get, Inject, Param, Post, Sse, MessageEvent } from '@nestjs/common';
import { Observable, merge, timer, map } from 'rxjs';
import { ListPendingPrompts } from '../use-cases/list-pending-prompts.use-case';
import { ResolveProactivePrompt } from '../use-cases/resolve-proactive-prompt.use-case';
import { PROACTIVE_EVENT_BUS, type ProactiveEventBus } from '../domain/proactive-event-bus';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { resolvePromptBody, type ResolvePromptBody } from './proactive.schemas';
import type { PendingPrompt } from '../domain/pending-prompt';

const HEARTBEAT_MS = 25_000;

/** A resolved prompt updates other tabs as 'prompt.resolved'; everything else is new. */
function eventTypeFor(prompt: PendingPrompt): string {
  return prompt.status === 'added' || prompt.status === 'discarded'
    ? 'prompt.resolved'
    : 'prompt.created';
}

@Controller('proactive')
export class ProactiveController {
  constructor(
    private readonly listPending: ListPendingPrompts,
    private readonly resolvePrompt: ResolveProactivePrompt,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Get('pending')
  async getPending() {
    return { prompts: await this.listPending.execute() };
  }

  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolvePromptBody)) body: ResolvePromptBody,
  ) {
    const result = await this.resolvePrompt.execute({
      promptId: id,
      action: body.action,
      overrides: body.action === 'add' ? body.overrides : undefined,
    });
    // Echo the resolved prompt on the bus so other tabs reconcile their cards.
    this.bus.publish(result.prompt.userId, result.prompt);
    return result;
  }

  @Sse('stream')
  async stream(): Promise<Observable<MessageEvent>> {
    const user = await this.currentUser.resolve();
    const events$ = new Observable<MessageEvent>((subscriber) => {
      const off = this.bus.subscribe(user.id, (prompt) =>
        subscriber.next({ type: eventTypeFor(prompt), data: prompt } as MessageEvent),
      );
      return () => off();
    });
    // A periodic comment-style event keeps proxies/load balancers from killing
    // an idle SSE connection; the browser EventSource simply ignores 'ping'.
    const heartbeat$ = timer(HEARTBEAT_MS, HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(events$, heartbeat$);
  }
}
