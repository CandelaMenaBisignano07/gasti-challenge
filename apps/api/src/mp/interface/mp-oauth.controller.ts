import { Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { StartMpConnect } from '../use-cases/start-mp-connect.use-case';
import { CompleteMpConnect } from '../use-cases/complete-mp-connect.use-case';
import { DisconnectMpAccount } from '../use-cases/disconnect-mp-account.use-case';
import { GetCurrentUser } from '../../users/use-cases/get-current-user.use-case';
import { isMpConnected } from '../../users/domain/user';

const UI_URL = process.env.UI_BASE_URL || 'http://localhost:3000';
// The OAuth round-trip runs over the ngrok HTTPS tunnel (MP requires an HTTPS
// redirect), so the state cookie must be `secure` exactly when that tunnel is.
const USE_SECURE_COOKIE = (process.env.MP_REDIRECT_URI ?? '').startsWith('https://');
const STATE_COOKIE = 'mp_oauth_state';

/** Constant-time string compare, length-guarded — used for the CSRF state nonce. */
function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

@Controller('mp/oauth')
export class MpOAuthController {
  constructor(
    private readonly start: StartMpConnect,
    private readonly complete: CompleteMpConnect,
    private readonly disconnectMp: DisconnectMpAccount,
    private readonly getUser: GetCurrentUser,
  ) {}

  @Get('start')
  startConnect(@Res() res: Response): void {
    const { authorizationUrl, state } = this.start.execute();
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: USE_SECURE_COOKIE,
      path: '/mp/oauth',
      maxAge: 10 * 60_000, // 10 min — bounds the CSRF window to one OAuth round-trip
    });
    res.redirect(authorizationUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expected = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/mp/oauth' });
    if (!code || !safeEqual(state, expected)) {
      res.redirect(`${UI_URL}/mp/callback?error=1`);
      return;
    }
    try {
      await this.complete.execute(code);
      res.redirect(`${UI_URL}/mp/callback`);
    } catch {
      // Code exchange failed (rejected/expired code, MP error, network) — keep
      // the user inside the OAuth UX contract instead of dumping a raw 500.
      res.redirect(`${UI_URL}/mp/callback?error=1`);
    }
  }

  @Post('disconnect')
  @HttpCode(204)
  disconnect(): Promise<void> {
    return this.disconnectMp.execute();
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
