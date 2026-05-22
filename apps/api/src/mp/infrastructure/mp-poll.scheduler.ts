import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/domain/users.repository';
import { PollMpPayments } from '../use-cases/poll-mp-payments.use-case';

@Injectable()
export class MpPollScheduler {
  private readonly log = new Logger(MpPollScheduler.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly poll: PollMpPayments,
  ) {}

  /** Every 2 minutes. Errors are caught per-user; one user does not block others. */
  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    const connected = await this.users.listMpConnected();
    for (const user of connected) {
      try {
        await this.poll.execute({ userId: user.id });
      } catch (err) {
        this.log.warn(`poll failed for user ${user.id}: ${(err as Error).message}`);
      }
    }
  }
}
