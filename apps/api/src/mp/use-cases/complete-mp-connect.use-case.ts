import { Inject, Injectable } from '@nestjs/common';
import { MpOAuthClient } from '../providers/mp-oauth-client.provider';
import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
import { DEFAULT_USER_ID } from '../../users/domain/user';
import { CLOCK, type Clock } from '../../shared/providers/clock';

@Injectable()
export class CompleteMpConnect {
  constructor(
    private readonly oauth: MpOAuthClient,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(code: string): Promise<void> {
    const t = await this.oauth.exchangeCode(code);
    await this.users.linkMpAccount(DEFAULT_USER_ID, {
      mpUserId: String(t.user_id),
      mpAccessToken: t.access_token,
      mpRefreshToken: t.refresh_token,
      mpTokenExpiresAt: new Date(this.clock.now().getTime() + t.expires_in * 1000),
      mpScope: t.scope,
      mpLiveMode: t.live_mode,
      mpConnectedAt: this.clock.now(),
    });
  }
}
