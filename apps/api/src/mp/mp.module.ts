import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MpOAuthClient } from './providers/mp-oauth-client.provider';
import { StartMpConnect } from './use-cases/start-mp-connect.use-case';
import { CompleteMpConnect } from './use-cases/complete-mp-connect.use-case';
import { RefreshMpToken } from './use-cases/refresh-mp-token.use-case';
import { DisconnectMpAccount } from './use-cases/disconnect-mp-account.use-case';
import { MpOAuthController } from './interface/mp-oauth.controller';
import { MpWebhookController } from './interface/mp-webhook.controller';
import { MP_PAYMENT_SOURCE } from './domain/mp-payment-source';
import { PAYMENT_CLASSIFIER } from './domain/payment-classifier';
import { MercadoPagoProvider } from './providers/mercado-pago.provider';
import { HttpPaymentClassifier } from './providers/http-payment-classifier';
import {
  MP_SIGNATURE_VERIFIER,
  createMpSignatureVerifier,
} from './providers/mp-signature-verifier';

// SharedModule is @Global() — CLOCK resolves without an explicit import here.
@Module({
  imports: [UsersModule],
  controllers: [MpOAuthController, MpWebhookController],
  providers: [
    MpOAuthClient,
    StartMpConnect,
    CompleteMpConnect,
    RefreshMpToken,
    DisconnectMpAccount,
    { provide: MP_PAYMENT_SOURCE, useClass: MercadoPagoProvider },
    { provide: PAYMENT_CLASSIFIER, useClass: HttpPaymentClassifier },
    {
      provide: MP_SIGNATURE_VERIFIER,
      useFactory: () => {
        const secret = process.env.MP_WEBHOOK_SECRET;
        if (!secret) throw new Error('MP_WEBHOOK_SECRET is required to start the API');
        return createMpSignatureVerifier(secret);
      },
    },
  ],
  exports: [MpOAuthClient, RefreshMpToken, MP_PAYMENT_SOURCE, PAYMENT_CLASSIFIER],
})
export class MpModule {}
