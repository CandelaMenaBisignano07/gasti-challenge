export type LanguageHint = 'es' | 'en' | null;

export interface User {
  readonly id: string;
  readonly displayName: string | null;
  readonly languagePref: LanguageHint;
  readonly mpUserId: string | null;
  readonly mpAccessToken: string | null;   // decrypted at the repository boundary
  readonly mpRefreshToken: string | null;
  readonly mpTokenExpiresAt: Date | null;
  readonly mpScope: string | null;
  readonly mpLiveMode: boolean | null;
  readonly mpConnectedAt: Date | null;
  readonly createdAt: Date;
}

export const DEFAULT_USER_ID = 'default-user';

export const isMpConnected = (u: User): boolean => u.mpUserId !== null;

export const isMpTokenExpired = (u: User, skewMs = 5 * 60_000): boolean =>
  u.mpTokenExpiresAt !== null && u.mpTokenExpiresAt.getTime() - skewMs < Date.now();
