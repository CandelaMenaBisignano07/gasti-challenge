import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { backfillScopeSchema } from '../domain/backfill-scope';
import { BackfillMpPayments } from '../use-cases/backfill-mp-payments.use-case';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';

const body = z.object({ scope: backfillScopeSchema });

@Controller('mp/backfill')
export class MpBackfillController {
  constructor(
    private readonly backfill: BackfillMpPayments,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Post()
  async run(@Body() raw: unknown) {
    const { scope } = body.parse(raw);
    const user = await this.currentUser.resolve();
    const summary = await this.backfill.execute({ userId: user.id, scope });
    return {
      id: summary.id,
      totalImported: summary.totalImported,
      lowConfidenceCount: summary.lowConfidenceCount,
      byOperationType: summary.byOperationType,
      truncated: summary.truncated,
    };
  }
}
