import type { User } from './user';

export const USERS_REPOSITORY = 'USERS_REPOSITORY';

export type MpLinkFields = Pick<User,
  'mpUserId' | 'mpAccessToken' | 'mpRefreshToken'
  | 'mpTokenExpiresAt' | 'mpScope' | 'mpLiveMode' | 'mpConnectedAt'>;

export type MpTokenFields = Pick<User,
  'mpAccessToken' | 'mpRefreshToken' | 'mpTokenExpiresAt'>;

export interface UsersRepository {
  getCurrent(): Promise<User>;
  getById(userId: string): Promise<User>;
  findByMpUserId(mpUserId: string): Promise<User | null>;
  listMpConnected(): Promise<User[]>;
  linkMpAccount(userId: string, mp: MpLinkFields): Promise<void>;
  updateMpTokens(userId: string, fields: MpTokenFields): Promise<void>;
  unlinkMpAccount(userId: string): Promise<void>;
}
