import { Body, Controller, Headers, HttpCode, Inject, Logger, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { mpWebhookBody, type MpWebhookBody } from './mp.schemas';
import {
  MP_SIGNATURE_VERIFIER,
  type MpSignatureVerifier,
} from '../providers/mp-signature-verifier';

@Controller('mp')
export class MpWebhookController {
  private readonly log = new Logger(MpWebhookController.name);

  constructor(
    @Inject(MP_SIGNATURE_VERIFIER) private readonly verify: MpSignatureVerifier,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  handle(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Body(new ZodValidationPipe(mpWebhookBody)) body: MpWebhookBody,
  ): { received: true } {
    if (!this.verify({ xSignature, xRequestId, dataId: body.data.id })) {
      // 200 to stop MP retrying a request we will not act on; logged for alerting.
      // Log only the request id — never the body, signature header, or any secret.
      this.log.warn(`MP webhook signature mismatch (x-request-id: ${xRequestId ?? 'none'})`);
      return { received: true };
    }
    if (body.type !== 'payment') return { received: true };
    // TODO Phase 7: fire-and-forget ProcessMpEvent.execute(...)
    return { received: true };
  }
}
