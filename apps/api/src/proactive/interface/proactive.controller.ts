import { Controller, Get, Inject, Sse, MessageEvent } from '@nestjs/common';
import { Observable, merge, timer, map } from 'rxjs';
import { ListPendingPrompts } from '../use-cases/list-pending-prompts.use-case';
import { PROACTIVE_EVENT_BUS, type ProactiveEventBus } from '../domain/proactive-event-bus';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';

const HEARTBEAT_MS = 25_000;

@Controller('proactive')
export class ProactiveController {
  constructor(
    private readonly listPending: ListPendingPrompts,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Get('pending')
  async getPending() {
    return { prompts: await this.listPending.execute() };
  }

  @Sse('stream')
  async stream(): Promise<Observable<MessageEvent>> {
    const user = await this.currentUser.resolve();
    const events$ = new Observable<MessageEvent>((subscriber) => {
      const off = this.bus.subscribe(user.id, (prompt) =>
        subscriber.next({ type: 'prompt.created', data: prompt } as MessageEvent),
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
