import { Controller, Get, Post, Query, Req, Res, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StartMpConnect } from '../use-cases/start-mp-connect.use-case';
import { CompleteMpConnect } from '../use-cases/complete-mp-connect.use-case';
import { GetCurrentUser } from '../../users/use-cases/get-current-user.use-case';
import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
import { isMpConnected } from '../../users/domain/user';

const UI_URL = process.env.UI_BASE_URL || 'http://localhost:3000';

@Controller('mp/oauth')
export class MpOAuthController {
  constructor(
    private readonly start: StartMpConnect,
    private readonly complete: CompleteMpConnect,
    private readonly getUser: GetCurrentUser,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  @Get('start')
  startConnect(@Res() res: Response): void {
    const { authorizationUrl, state } = this.start.execute();
    res.cookie('mp_oauth_state', state, { httpOnly: true, sameSite: 'lax' });
    res.redirect(authorizationUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expected = (req.cookies as Record<string, string> | undefined)?.mp_oauth_state;
    res.clearCookie('mp_oauth_state');
    if (!code || !state || state !== expected) {
      res.redirect(`${UI_URL}/?mp=error`);
      return;
    }
    await this.complete.execute(code);
    res.redirect(`${UI_URL}/?mp=connected`);
  }

  @Post('disconnect')
  async disconnect(@Res() res: Response): Promise<void> {
    const user = await this.getUser.execute();
    await this.users.unlinkMpAccount(user.id);
    res.status(204).send();
  }

  @Get('status')
  async status(): Promise<{ connected: boolean; mpUserIdLast4?: string; connectedAt?: string }> {
    const user = await this.getUser.execute();
    if (!isMpConnected(user)) return { connected: false };
    return {
      connected: true,
      mpUserIdLast4: user.mpUserId!.slice(-4),
      connectedAt: user.mpConnectedAt?.toISOString(),
    };
  }
}
