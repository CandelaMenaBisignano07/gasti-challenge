import { Inject, Injectable } from '@nestjs/common';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';
import {
  PENDING_PROMPTS_REPOSITORY,
  type PendingPromptsRepository,
} from '../domain/pending-prompts.repository';
import type { PendingPrompt } from '../domain/pending-prompt';

@Injectable()
export class ListPendingPrompts {
  constructor(
    @Inject(PENDING_PROMPTS_REPOSITORY) private readonly repo: PendingPromptsRepository,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  async execute(): Promise<PendingPrompt[]> {
    const user = await this.currentUser.resolve();
    return this.repo.listPending(user.id);
  }
}
