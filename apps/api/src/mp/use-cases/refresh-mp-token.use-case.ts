import { Inject, Injectable } from '@nestjs/common';
import { MpOAuthClient, MpOAuthError } from '../providers/mp-oauth-client.provider';
import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import type { User } from '../../users/domain/user';

export class MpReauthRequiredError extends Error {
  constructor() { super('Mercado Pago re-authorization required'); this.name = 'MpReauthRequiredError'; }
}

@Injectable()
export class RefreshMpToken {
  constructor(
    private readonly oauth: MpOAuthClient,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Returns a fresh access token; refreshes if needed; unlinks + throws on terminal failure. */
  async execute(user: User): Promise<string> {
    if (!user.mpRefreshToken) throw new MpReauthRequiredError();
    try {
      const t = await this.oauth.refresh(user.mpRefreshToken);
      await this.users.updateMpTokens(user.id, {
        mpAccessToken: t.access_token,
        mpRefreshToken: t.refresh_token,
        mpTokenExpiresAt: new Date(this.clock.now().getTime() + t.expires_in * 1000),
      });
      return t.access_token;
    } catch (err) {
      if (err instanceof MpOAuthError && err.status === 400) {
        await this.users.unlinkMpAccount(user.id);
        throw new MpReauthRequiredError();
      }
      throw err;
    }
  }
}
