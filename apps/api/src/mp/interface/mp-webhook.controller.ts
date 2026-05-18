import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { mpWebhookBody, type MpWebhookBody } from './mp.schemas';
import { createMpSignatureVerifier } from '../providers/mp-signature-verifier';

@Controller('mp')
export class MpWebhookController {
  private readonly verify = createMpSignatureVerifier(process.env.MP_WEBHOOK_SECRET ?? '');

  @Post('webhook')
  @HttpCode(200)
  handle(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Body(new ZodValidationPipe(mpWebhookBody)) body: MpWebhookBody,
  ): { received: true } {
    if (!this.verify({ xSignature, xRequestId, dataId: body.data.id })) {
      // 200 to stop MP retrying a request we will not act on; logged for alerting.
      return { received: true };
    }
    if (body.type !== 'payment') return { received: true };
    // TODO Phase 7: fire-and-forget ProcessMpEvent.execute(...)
    return { received: true };
  }
}
