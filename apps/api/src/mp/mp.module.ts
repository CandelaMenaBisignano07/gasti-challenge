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
import { BackfillMpPayments } from './use-cases/backfill-mp-payments.use-case';
import { MpOAuthController } from './interface/mp-oauth.controller';
import { MpBackfillController } from './interface/mp-backfill.controller';
import { PAYMENT_CLASSIFIER } from './domain/payment-classifier';
import { HttpPaymentClassifier } from './providers/http-payment-classifier';
import { BATCH_CLASSIFIER } from './domain/batch-classifier';
import { HttpBatchClassifier } from './providers/http-batch-classifier';
import { MP_PAYMENTS_SEARCH_GATEWAY } from './domain/mp-payments-search.gateway';
import { HttpMpPaymentsSearchGateway } from './providers/http-mp-payments-search.gateway';
import { MP_USER_LOOKUP_GATEWAY } from './domain/mp-user-lookup.gateway';
import { HttpMpUserLookupGateway } from './providers/http-mp-user-lookup.gateway';
import { MP_POLL_CURSORS_REPOSITORY } from './domain/mp-poll-cursors.repository';
import { JsonMpPollCursorsRepository } from './repositories/json-mp-poll-cursors.repository';
import { BACKFILL_SUMMARIES_REPOSITORY } from '../proactive/domain/backfill-summaries.repository';
import { JsonBackfillSummariesRepository } from '../proactive/repositories/json-backfill-summaries.repository';
import { MpPollScheduler } from './infrastructure/mp-poll.scheduler';

// SharedModule is @Global() — CLOCK resolves without an explicit import here.
@Module({
  imports: [UsersModule, ProactiveModule, TransactionsModule],
  controllers: [MpOAuthController, MpBackfillController],
  providers: [
    MpOAuthClient,
    StartMpConnect,
    CompleteMpConnect,
    RefreshMpToken,
    DisconnectMpAccount,
    ProcessMpEvent,
    PollMpPayments,
    BackfillMpPayments,
    MpPollScheduler,
    { provide: PAYMENT_CLASSIFIER, useClass: HttpPaymentClassifier },
    { provide: BATCH_CLASSIFIER, useClass: HttpBatchClassifier },
    { provide: MP_PAYMENTS_SEARCH_GATEWAY, useClass: HttpMpPaymentsSearchGateway },
    { provide: MP_USER_LOOKUP_GATEWAY, useClass: HttpMpUserLookupGateway },
    { provide: MP_POLL_CURSORS_REPOSITORY, useClass: JsonMpPollCursorsRepository },
    { provide: BACKFILL_SUMMARIES_REPOSITORY, useClass: JsonBackfillSummariesRepository },
  ],
  exports: [MpOAuthClient, RefreshMpToken, PAYMENT_CLASSIFIER],
})
export class MpModule {}
