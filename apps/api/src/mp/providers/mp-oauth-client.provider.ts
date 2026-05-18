import { Injectable } from '@nestjs/common';
import type { MpOAuthTokenResponse } from './mp-oauth-response';

@Injectable()
export class MpOAuthClient {
  private cfg() {
    const clientId = process.env.MP_CLIENT_ID;
    const clientSecret = process.env.MP_CLIENT_SECRET;
    const redirectUri = process.env.MP_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('MP_CLIENT_ID, MP_CLIENT_SECRET and MP_REDIRECT_URI are required');
    }
    return { clientId, clientSecret, redirectUri };
  }

  authorizationUrl(state: string): string {
    const { clientId, redirectUri } = this.cfg();
    const q = new URLSearchParams({
      client_id: clientId, response_type: 'code', platform_id: 'mp',
      state, redirect_uri: redirectUri,
    });
    return `https://auth.mercadopago.com/authorization?${q.toString()}`;
  }

  private async tokenRequest(body: Record<string, string>): Promise<MpOAuthTokenResponse> {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new MpOAuthError(String(json.error ?? `HTTP ${res.status}`), res.status);
    }
    return json as unknown as MpOAuthTokenResponse;
  }

  exchangeCode(code: string): Promise<MpOAuthTokenResponse> {
    const { clientId, clientSecret, redirectUri } = this.cfg();
    return this.tokenRequest({
      grant_type: 'authorization_code', client_id: clientId,
      client_secret: clientSecret, code, redirect_uri: redirectUri,
    });
  }

  refresh(refreshToken: string): Promise<MpOAuthTokenResponse> {
    const { clientId, clientSecret } = this.cfg();
    return this.tokenRequest({
      grant_type: 'refresh_token', client_id: clientId,
      client_secret: clientSecret, refresh_token: refreshToken,
    });
  }
}

export class MpOAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MpOAuthError';
  }
}
