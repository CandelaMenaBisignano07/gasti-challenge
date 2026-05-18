import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategorizationModule } from '../categorization/categorization.module';
import { PENDING_PROMPTS_REPOSITORY } from './domain/pending-prompts.repository';
import { PROACTIVE_EVENT_BUS } from './domain/proactive-event-bus';
import { JsonPendingPromptsRepository } from './repositories/json-pending-prompts.repository';
import { InMemoryProactiveEventBus } from './providers/in-memory-proactive-event-bus';
import { ListPendingPrompts } from './use-cases/list-pending-prompts.use-case';
import { ResolveProactivePrompt } from './use-cases/resolve-proactive-prompt.use-case';
import { ProactiveController } from './interface/proactive.controller';

@Module({
  imports: [UsersModule, TransactionsModule, CategorizationModule],
  controllers: [ProactiveController],
  providers: [
    { provide: PENDING_PROMPTS_REPOSITORY, useClass: JsonPendingPromptsRepository },
    { provide: PROACTIVE_EVENT_BUS, useClass: InMemoryProactiveEventBus },
    ListPendingPrompts,
    ResolveProactivePrompt,
  ],
  exports: [PENDING_PROMPTS_REPOSITORY, PROACTIVE_EVENT_BUS],
})
export class ProactiveModule {}
