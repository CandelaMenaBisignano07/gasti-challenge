import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { USERS_FILE } from '../../shared/providers/paths';
import { TOKEN_CIPHER, type TokenCipherDep } from '../../shared/security/token-cipher.token';
import type { EncryptedToken } from '../../shared/security/token-cipher';
import { DEFAULT_USER_ID, type User } from '../domain/user';
import type { MpLinkFields, MpTokenFields, UsersRepository } from '../domain/users.repository';

interface UserRow {
  id: string;
  displayName: string | null;
  languagePref: 'es' | 'en' | null;
  mpUserId: string | null;
  mpAccessTokenEnc: EncryptedToken | null;
  mpRefreshTokenEnc: EncryptedToken | null;
  mpTokenExpiresAt: string | null;
  mpScope: string | null;
  mpLiveMode: boolean | null;
  mpConnectedAt: string | null;
  createdAt: string;
}

const seedRow: UserRow = Object.freeze({
  id: DEFAULT_USER_ID, displayName: null, languagePref: null, mpUserId: null,
  mpAccessTokenEnc: null, mpRefreshTokenEnc: null, mpTokenExpiresAt: null,
  mpScope: null, mpLiveMode: null, mpConnectedAt: null,
  createdAt: new Date('2026-05-01T00:00:00.000Z').toISOString(),
});

@Injectable()
export class JsonUsersRepository implements UsersRepository {
  private readonly log = new Logger(JsonUsersRepository.name);
  private readonly store: JsonStore<UserRow[]> = createJsonStore<UserRow[]>(USERS_FILE, [seedRow]);

  constructor(@Inject(TOKEN_CIPHER) private readonly cipher: TokenCipherDep) {}

  private decryptToken(enc: EncryptedToken | null, userId: string): string | null {
    if (!enc) return null;
    try {
      return this.cipher.decrypt(enc);
    } catch {
      this.log.warn(`MP token for ${userId} failed to decrypt — treating user as disconnected`);
      return null;
    }
  }

  private toUser(r: UserRow): User {
    return {
      id: r.id,
      displayName: r.displayName,
      languagePref: r.languagePref,
      mpUserId: r.mpUserId,
      mpAccessToken: this.decryptToken(r.mpAccessTokenEnc, r.id),
      mpRefreshToken: this.decryptToken(r.mpRefreshTokenEnc, r.id),
      mpTokenExpiresAt: r.mpTokenExpiresAt ? new Date(r.mpTokenExpiresAt) : null,
      mpScope: r.mpScope,
      mpLiveMode: r.mpLiveMode,
      mpConnectedAt: r.mpConnectedAt ? new Date(r.mpConnectedAt) : null,
      createdAt: new Date(r.createdAt),
    };
  }

  private async mutate(userId: string, patch: (r: UserRow) => UserRow): Promise<void> {
    const rows = await this.store.read();
    const i = rows.findIndex((r) => r.id === userId);
    if (i === -1) throw new Error(`user ${userId} not found`);
    rows[i] = patch(rows[i]);
    await this.store.write(rows);
  }

  async getCurrent(): Promise<User> {
    const rows = await this.store.read();
    const row = rows.find((r) => r.id === DEFAULT_USER_ID) ?? rows[0];
    if (!row) throw new Error('no users present in the store');
    return this.toUser(row);
  }

  async findByMpUserId(mpUserId: string): Promise<User | null> {
    const rows = await this.store.read();
    const row = rows.find((r) => r.mpUserId === mpUserId);
    return row ? this.toUser(row) : null;
  }

  async linkMpAccount(userId: string, mp: MpLinkFields): Promise<void> {
    await this.mutate(userId, (r) => ({
      ...r,
      mpUserId: mp.mpUserId,
      mpAccessTokenEnc: mp.mpAccessToken ? this.cipher.encrypt(mp.mpAccessToken) : null,
      mpRefreshTokenEnc: mp.mpRefreshToken ? this.cipher.encrypt(mp.mpRefreshToken) : null,
      mpTokenExpiresAt: mp.mpTokenExpiresAt?.toISOString() ?? null,
      mpScope: mp.mpScope,
      mpLiveMode: mp.mpLiveMode,
      mpConnectedAt: mp.mpConnectedAt?.toISOString() ?? null,
    }));
  }

  async updateMpTokens(userId: string, f: MpTokenFields): Promise<void> {
    await this.mutate(userId, (r) => ({
      ...r,
      mpAccessTokenEnc: f.mpAccessToken ? this.cipher.encrypt(f.mpAccessToken) : null,
      mpRefreshTokenEnc: f.mpRefreshToken ? this.cipher.encrypt(f.mpRefreshToken) : null,
      mpTokenExpiresAt: f.mpTokenExpiresAt?.toISOString() ?? null,
    }));
  }

  async unlinkMpAccount(userId: string): Promise<void> {
    await this.mutate(userId, (r) => ({
      ...r, mpUserId: null, mpAccessTokenEnc: null, mpRefreshTokenEnc: null,
      mpTokenExpiresAt: null, mpScope: null, mpLiveMode: null, mpConnectedAt: null,
    }));
  }
}
