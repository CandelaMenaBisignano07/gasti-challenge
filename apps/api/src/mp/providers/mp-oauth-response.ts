export interface MpOAuthTokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly scope: string;
  readonly user_id: number;
  readonly refresh_token: string;
  readonly public_key: string;
  readonly live_mode: boolean;
}
