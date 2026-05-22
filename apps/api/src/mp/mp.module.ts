import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ProactiveModule } from '../proactive/proactive.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { MpOAuthClient } from './providers/mp-oauth-client.provider';
import { StartMpConnect } from './use-cases/start-mp-connect.use-case';
import { CompleteMpConnect } from './use-cases/complete-mp-connect.use-case';
import { RefreshMpToken } from './use-cases/refresh-mp-token.use-case';
import { DisconnectMpAccount } from './use-cases/disconnect-mp-account.use-case';
import { ProcessMpEvent } from './use-cases/process-mp-event.use-case';
import { PollMpPayments } from './use-cases/poll-mp-payments.use-case';
import { MpOAuthController } from './interface/mp-oauth.controller';
import { PAYMENT_CLASSIFIER } from './domain/payment-classifier';
import { HttpPaymentClassifier } from './providers/http-payment-classifier';
import { MP_PAYMENTS_SEARCH_GATEWAY } from './domain/mp-payments-search.gateway';
import { HttpMpPaymentsSearchGateway } from './providers/http-mp-payments-search.gateway';
import { MP_POLL_CURSORS_REPOSITORY } from './domain/mp-poll-cursors.repository';
import { JsonMpPollCursorsRepository } from './repositories/json-mp-poll-cursors.repository';
import { MpPollScheduler } from './infrastructure/mp-poll.scheduler';

// SharedModule is @Global() — CLOCK resolves without an explicit import here.
@Module({
  imports: [UsersModule, ProactiveModule, TransactionsModule],
  controllers: [MpOAuthController],
  providers: [
    MpOAuthClient,
    StartMpConnect,
    CompleteMpConnect,
    RefreshMpToken,
    DisconnectMpAccount,
    ProcessMpEvent,
    PollMpPayments,
    MpPollScheduler,
    { provide: PAYMENT_CLASSIFIER, useClass: HttpPaymentClassifier },
    { provide: MP_PAYMENTS_SEARCH_GATEWAY, useClass: HttpMpPaymentsSearchGateway },
    { provide: MP_POLL_CURSORS_REPOSITORY, useClass: JsonMpPollCursorsRepository },
  ],
  exports: [MpOAuthClient, RefreshMpToken, PAYMENT_CLASSIFIER],
})
export class MpModule {}
