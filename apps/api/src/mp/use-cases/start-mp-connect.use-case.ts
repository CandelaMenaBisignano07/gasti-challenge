import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MpOAuthClient } from '../providers/mp-oauth-client.provider';

@Injectable()
export class StartMpConnect {
  constructor(private readonly oauth: MpOAuthClient) {}
  execute(): { authorizationUrl: string; state: string } {
    const state = randomUUID();
    return { authorizationUrl: this.oauth.authorizationUrl(state), state };
  }
}
