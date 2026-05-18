import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MpOAuthClient } from './providers/mp-oauth-client.provider';
import { StartMpConnect } from './use-cases/start-mp-connect.use-case';
import { CompleteMpConnect } from './use-cases/complete-mp-connect.use-case';
import { RefreshMpToken } from './use-cases/refresh-mp-token.use-case';
import { DisconnectMpAccount } from './use-cases/disconnect-mp-account.use-case';
import { MpOAuthController } from './interface/mp-oauth.controller';
import { MpWebhookController } from './interface/mp-webhook.controller';

// SharedModule is @Global() — CLOCK resolves without an explicit import here.
@Module({
  imports: [UsersModule],
  controllers: [MpOAuthController, MpWebhookController],
  providers: [MpOAuthClient, StartMpConnect, CompleteMpConnect, RefreshMpToken, DisconnectMpAccount],
  exports: [MpOAuthClient, RefreshMpToken],
})
export class MpModule {}
