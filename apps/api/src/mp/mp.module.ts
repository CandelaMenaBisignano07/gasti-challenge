import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SharedModule } from '../shared/shared.module';
import { MpOAuthClient } from './providers/mp-oauth-client.provider';
import { StartMpConnect } from './use-cases/start-mp-connect.use-case';
import { CompleteMpConnect } from './use-cases/complete-mp-connect.use-case';
import { RefreshMpToken } from './use-cases/refresh-mp-token.use-case';
import { MpOAuthController } from './interface/mp-oauth.controller';

@Module({
  imports: [UsersModule, SharedModule],
  controllers: [MpOAuthController],
  providers: [MpOAuthClient, StartMpConnect, CompleteMpConnect, RefreshMpToken],
  exports: [MpOAuthClient, RefreshMpToken],
})
export class MpModule {}
