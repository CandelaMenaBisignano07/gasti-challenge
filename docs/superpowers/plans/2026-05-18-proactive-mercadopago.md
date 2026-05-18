# Proactive Mercado Pago — Implementation Plan (refreshed)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Supersedes** `docs/superpowers/plans/2026-05-14-proactive-mercadopago.md`. That plan was written before `apps/api`, `apps/ai`, and `apps/ui` were built; this one is rewritten against the merged `main` (`ab1eb95`). Key changes: **storage is JSON, not libsql** (see spec §6, revised 2026-05-18); the classifier is `apps/ai`'s first Mastra workflow; UI surfaces live inside the existing `apps/ui/src/` feature-folder layout.

**Goal:** Wire a real Mercado Pago integration into Gasti so settled payments surface as in-chat confirmation cards (pre-classified) and reversals appear as informational notices, all within an open chat session.

**Architecture:** Three apps, clean boundaries. `apps/api` (NestJS) owns the MP webhook receiver, OAuth flow, JSON persistence, and the SSE proactive stream. `apps/ai` (Mastra) hosts a single classifier `Workflow` exposed over Mastra's HTTP server. `apps/ui` (Next.js) renders proactive cards inline in the chat thread and a composer chip for the MP connection state.

**Tech Stack:** Bun + Turborepo, NestJS 10, Mastra 1.33, Next.js 15 / React 19, Tailwind 3, `mercadopago` SDK, Zod 3, Lucide icons. No libsql in `apps/api` — JSON files via the existing `createJsonStore`.

**Spec:** [docs/superpowers/specs/2026-05-14-proactive-mercadopago-design.md](../specs/2026-05-14-proactive-mercadopago-design.md) (revised 2026-05-18).

**Testing posture:** PRODUCT.md says tests are not a deliverable, but `apps/api` already ships a `bun:test` suite and the repo convention is to keep it green. We write tests for: `TokenCipher`, `isCompletedPayment`, `mapMpStatusToTransactionStatus`, `MpSignatureVerifier`, `ProcessMpEvent` (orchestration with in-memory fakes), and `ResolveProactivePrompt`. After Phase 6, the **whole `apps/api` suite must still pass**. `apps/ai` and `apps/ui` are exercised manually per spec §12.

---

## Conventions to match (verified against `main`)

- **apps/api** — NestJS feature folders `feature/{domain,interface,repositories,use-cases}`. DI: string token + interface exported from `domain/*.ts`; module wires `{ provide: TOKEN, useClass: Impl }`; constructor `@Inject(TOKEN)`. Controllers are thin, instantiate `new ZodValidationPipe(schema)` per route. Errors: throw `DomainError(code, message)`; `DomainExceptionFilter` is global. Storage: `createJsonStore<T>(filePath, fallback)` from `src/shared/providers/json-store.ts`. Paths from `src/shared/providers/paths.ts` (`DATA_DIR`). Env via `process.env` (no ConfigModule). Tests: `bun:test`, fakes in `src/shared/testing/fakes.ts`.
- **apps/ai** — Mastra `@mastra/core@^1.33`. Feature folders `feature/{domain,interface,providers}`. The Mastra instance is built in `src/mastra/index.ts`. `mastra dev` serves on `:4111`.
- **apps/ui** — Next 15 App Router, kebab-case files, named exports, `'use client'` at component level. Feature folders `src/<feature>/{domain,infrastructure,components,repositories,use-cases}`. Tailwind tokens already defined in `app/globals.css` + `tailwind.config.ts`. Path alias `@/* → src/*`.

---

## Phase 0 — Project prep

Dependencies and env. No app logic.

### Task 0.1: Install the Mercado Pago SDK in apps/api

**Files:** Modify `apps/api/package.json`, `bun.lock`

- [ ] **Step 1:** From the repo root run `bun add --filter=api mercadopago`.
- [ ] **Step 2:** Verify: `bun pm ls --filter=api` lists `mercadopago`. (`zod` is already a dependency — do not re-add it.)
- [ ] **Step 3:** Commit:
  ```bash
  git add apps/api/package.json bun.lock
  git commit -m "chore(api): add mercadopago SDK"
  ```

### Task 0.2: Declare apps/api MP env vars

**Files:** Modify `apps/api/.env.example`

- [ ] **Step 1:** Append to `apps/api/.env.example`:
  ```
  # --- Mercado Pago integration ---
  # MP application credentials (MP developer panel → your app)
  MP_CLIENT_ID=
  MP_CLIENT_SECRET=
  # Signing secret for inbound webhook verification (MP panel → Webhooks)
  MP_WEBHOOK_SECRET=
  # OAuth redirect, must match the MP panel exactly: <ngrok-url>/mp/oauth/callback
  MP_REDIRECT_URI=
  # 32-byte base64 key for AES-256-GCM token encryption at rest.
  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  TOKEN_ENCRYPTION_KEY=
  # Base URL of the apps/ai Mastra server (classifier workflow). Default http://localhost:4111
  AI_BASE_URL=
  ```
- [ ] **Step 2:** Commit:
  ```bash
  git add apps/api/.env.example
  git commit -m "docs(api): document Mercado Pago env vars"
  ```

### Task 0.3: Declare apps/ui API base URL

**Files:** Create `apps/ui/.env.example`

- [ ] **Step 1:** Create `apps/ui/.env.example`:
  ```
  # Base URL of the apps/api service for proactive SSE + MP REST calls.
  # Default http://localhost:3001
  NEXT_PUBLIC_API_BASE_URL=
  ```
- [ ] **Step 2:** Commit:
  ```bash
  git add apps/ui/.env.example
  git commit -m "docs(ui): document API base URL env var"
  ```

> `apps/ai` needs no new deps or env vars (`OPENAI_API_KEY` already powers the agent and will power the classifier).

---

## Phase 1 — apps/api: token cipher + users feature

The `users` feature: the multi-tenant-shaped `User` value object, a JSON repository that encrypts MP tokens at rest, and a current-user provider.

### Task 1.1: TokenCipher provider (AES-256-GCM)

**Files:**
- Create `apps/api/src/shared/security/token-cipher.ts`
- Test `apps/api/src/shared/security/token-cipher.test.ts`

- [ ] **Step 1: Write the failing test.**
  ```ts
  import { test, expect } from 'bun:test';
  import { createTokenCipher, type EncryptedToken } from './token-cipher';

  const KEY = Buffer.alloc(32, 7).toString('base64');

  test('round-trips a token', () => {
    const cipher = createTokenCipher(KEY);
    const enc = cipher.encrypt('APP_USR-secret-token');
    expect(enc.ciphertext).not.toBe('APP_USR-secret-token');
    expect(cipher.decrypt(enc)).toBe('APP_USR-secret-token');
  });

  test('a tampered ciphertext fails to decrypt', () => {
    const cipher = createTokenCipher(KEY);
    const enc = cipher.encrypt('x');
    const tampered: EncryptedToken = { ...enc, ciphertext: Buffer.from('zzzz').toString('base64') };
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  test('rejects a key that is not 32 bytes', () => {
    expect(() => createTokenCipher(Buffer.alloc(16).toString('base64'))).toThrow();
  });
  ```
- [ ] **Step 2:** Run `bun test src/shared/security/token-cipher.test.ts` (from `apps/api`). Expect FAIL — module missing.
- [ ] **Step 3: Implement.**
  ```ts
  import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

  export interface EncryptedToken {
    readonly ciphertext: string; // base64
    readonly iv: string;         // base64
    readonly tag: string;        // base64
  }

  export interface TokenCipher {
    encrypt(plaintext: string): EncryptedToken;
    decrypt(token: EncryptedToken): string;
  }

  /** AES-256-GCM cipher. `keyBase64` must decode to exactly 32 bytes. */
  export function createTokenCipher(keyBase64: string): TokenCipher {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
    return {
      encrypt(plaintext) {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        return {
          ciphertext: ciphertext.toString('base64'),
          iv: iv.toString('base64'),
          tag: cipher.getAuthTag().toString('base64'),
        };
      },
      decrypt(token) {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(token.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(token.tag, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(token.ciphertext, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      },
    };
  }
  ```
- [ ] **Step 4:** Run the test again. Expect PASS.
- [ ] **Step 5: Commit:**
  ```bash
  git add apps/api/src/shared/security/token-cipher.ts apps/api/src/shared/security/token-cipher.test.ts
  git commit -m "feat(api): AES-256-GCM token cipher"
  ```

### Task 1.2: User domain

**Files:** Create `apps/api/src/users/domain/user.ts`

- [ ] **Step 1:** Create the file:
  ```ts
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
  ```
- [ ] **Step 2:** Commit: `git commit -am "feat(api): User domain entity"` (after `git add`).

### Task 1.3: UsersRepository interface

**Files:** Create `apps/api/src/users/domain/users.repository.ts`

- [ ] **Step 1:** Create:
  ```ts
  import type { User } from './user';

  export const USERS_REPOSITORY = 'USERS_REPOSITORY';

  export type MpLinkFields = Pick<User,
    'mpUserId' | 'mpAccessToken' | 'mpRefreshToken'
    | 'mpTokenExpiresAt' | 'mpScope' | 'mpLiveMode' | 'mpConnectedAt'>;

  export type MpTokenFields = Pick<User,
    'mpAccessToken' | 'mpRefreshToken' | 'mpTokenExpiresAt'>;

  export interface UsersRepository {
    getCurrent(): Promise<User>;
    findByMpUserId(mpUserId: string): Promise<User | null>;
    linkMpAccount(userId: string, mp: MpLinkFields): Promise<void>;
    updateMpTokens(userId: string, fields: MpTokenFields): Promise<void>;
    unlinkMpAccount(userId: string): Promise<void>;
  }
  ```
- [ ] **Step 2:** Commit.

### Task 1.4: JsonUsersRepository

**Files:**
- Modify `apps/api/src/shared/providers/paths.ts` — add `USERS_FILE`
- Create `apps/api/src/users/repositories/json-users.repository.ts`

- [ ] **Step 1:** In `paths.ts`, after `DATA_DIR`, add:
  ```ts
  export const USERS_FILE = process.env.USERS_FILE || path.join(DATA_DIR, 'users.json');
  export const PENDING_PROMPTS_FILE =
    process.env.PENDING_PROMPTS_FILE || path.join(DATA_DIR, 'pending-prompts.json');
  ```
- [ ] **Step 2:** Create the repository. It stores an internal `UserRow` (encrypted tokens) and maps to/from the decrypted `User`. The cipher is injected. The fallback seeds `default-user`.
  ```ts
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

  const seedRow: UserRow = {
    id: DEFAULT_USER_ID, displayName: null, languagePref: null, mpUserId: null,
    mpAccessTokenEnc: null, mpRefreshTokenEnc: null, mpTokenExpiresAt: null,
    mpScope: null, mpLiveMode: null, mpConnectedAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z').toISOString(),
  };

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
      return this.toUser(rows[0]);
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
  ```
- [ ] **Step 3:** Create `apps/api/src/shared/security/token-cipher.token.ts` (the DI token + type — keeps the pure cipher module framework-free):
  ```ts
  import type { TokenCipher } from './token-cipher';
  export const TOKEN_CIPHER = 'TOKEN_CIPHER';
  export type TokenCipherDep = TokenCipher;
  ```
- [ ] **Step 4:** Typecheck: `bun run build --filter=api` (or `bunx tsc -p apps/api/tsconfig.json --noEmit`). Expect success.
- [ ] **Step 5:** Commit: `feat(api): JSON users repository with encrypted MP tokens`.

### Task 1.5: get-current-user use-case + CurrentUser provider

**Files:**
- Create `apps/api/src/users/use-cases/get-current-user.use-case.ts`
- Create `apps/api/src/users/providers/current-user.provider.ts`

- [ ] **Step 1:** `get-current-user.use-case.ts`:
  ```ts
  import { Inject, Injectable } from '@nestjs/common';
  import { USERS_REPOSITORY, type UsersRepository } from '../domain/users.repository';
  import type { User } from '../domain/user';

  @Injectable()
  export class GetCurrentUser {
    constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}
    execute(): Promise<User> {
      return this.users.getCurrent();
    }
  }
  ```
- [ ] **Step 2:** `current-user.provider.ts` — resolves the acting user. v1 is single-user, so it always returns `getCurrent()`; the `x-user-id` header (already sent by `apps/ai`'s api-client) is accepted but ignored beyond `default-user`.
  ```ts
  import { Inject, Injectable } from '@nestjs/common';
  import { USERS_REPOSITORY, type UsersRepository } from '../domain/users.repository';
  import type { User } from '../domain/user';

  @Injectable()
  export class CurrentUserProvider {
    constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}
    /** v1: single user. `headerUserId` reserved for multi-tenant. */
    resolve(_headerUserId?: string): Promise<User> {
      return this.users.getCurrent();
    }
  }
  ```
- [ ] **Step 3:** Commit: `feat(api): get-current-user use-case and CurrentUser provider`.

### Task 1.6: users.module.ts + app wiring

**Files:**
- Create `apps/api/src/users/users.module.ts`
- Modify `apps/api/src/app.module.ts`
- Modify `apps/api/src/main.ts`

- [ ] **Step 1:** `users.module.ts` — note `TOKEN_CIPHER` is provided here from env, and the module fails loud if the key is absent:
  ```ts
  import { Module } from '@nestjs/common';
  import { createTokenCipher } from '../shared/security/token-cipher';
  import { TOKEN_CIPHER } from '../shared/security/token-cipher.token';
  import { USERS_REPOSITORY } from './domain/users.repository';
  import { JsonUsersRepository } from './repositories/json-users.repository';
  import { GetCurrentUser } from './use-cases/get-current-user.use-case';
  import { CurrentUserProvider } from './providers/current-user.provider';

  @Module({
    providers: [
      {
        provide: TOKEN_CIPHER,
        useFactory: () => {
          const key = process.env.TOKEN_ENCRYPTION_KEY;
          if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to start the API');
          return createTokenCipher(key);
        },
      },
      { provide: USERS_REPOSITORY, useClass: JsonUsersRepository },
      GetCurrentUser,
      CurrentUserProvider,
    ],
    exports: [USERS_REPOSITORY, TOKEN_CIPHER, GetCurrentUser, CurrentUserProvider],
  })
  export class UsersModule {}
  ```
- [ ] **Step 2:** Add `UsersModule` to `app.module.ts` `imports`.
- [ ] **Step 3:** Verify boot fails clearly without the key, then succeeds with it: set `TOKEN_ENCRYPTION_KEY` in `apps/api/.env`, run `bun dev --filter=api`, hit `http://localhost:3001/health`. Expect 200. (No key → boot throws the explicit error.)
- [ ] **Step 4:** Run `bun test` in `apps/api` — all existing tests still pass.
- [ ] **Step 5:** Commit: `feat(api): wire users module`.

---

## Phase 2 — apps/api: MP OAuth flow

### Task 2.1: MP OAuth client provider

**Files:** Create `apps/api/src/mp/providers/mp-oauth-client.provider.ts`, `apps/api/src/mp/providers/mp-oauth-response.ts`

- [ ] **Step 1:** `mp-oauth-response.ts`:
  ```ts
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
  ```
- [ ] **Step 2:** `mp-oauth-client.provider.ts` — wraps the two MP OAuth HTTP calls (`/oauth/token` with `grant_type=authorization_code` and `grant_type=refresh_token`) and the authorization-URL builder. Use `fetch` directly (the `mercadopago` SDK's OAuth helper API is unstable across versions; a direct POST to `https://api.mercadopago.com/oauth/token` is documented and stable). Read `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI` from `process.env`.
  ```ts
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
  ```
- [ ] **Step 3:** Verify against the MP docs **before relying on these URLs**: use the Mercado Pago MCP to confirm the authorization endpoint, `/oauth/token` body params, and the `MpOAuthTokenResponse` shape. Adjust if MP's current API differs.
- [ ] **Step 4:** Commit: `feat(api): Mercado Pago OAuth client`.

### Task 2.2: OAuth use-cases

**Files:** Create `apps/api/src/mp/use-cases/{start-mp-connect,complete-mp-connect,refresh-mp-token}.use-case.ts`

- [ ] **Step 1:** `start-mp-connect.use-case.ts` — generates a `state` nonce (`crypto.randomUUID()`) and returns it with the authorization URL. The controller stores the nonce in a cookie.
  ```ts
  import { Injectable } from '@nestjs/common';
  import { randomUUID } from 'node:crypto';
  import { MpOAuthClient } from '../providers/mp-oauth-client.provider';

  @Injectable()
  export class StartMpConnect {
    constructor(private readonly oauth: MpOAuthClient) {}
    execute(): { authorizationUrl: string; state: string } {
      const state = randomUUID();
      return { authorizationUrl: this.oauth.authorizationUrl(state), state };
    }
  }
  ```
- [ ] **Step 2:** `complete-mp-connect.use-case.ts` — exchanges the code and links the account. Takes the decoded current user.
  ```ts
  import { Inject, Injectable } from '@nestjs/common';
  import { MpOAuthClient } from '../providers/mp-oauth-client.provider';
  import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
  import { DEFAULT_USER_ID } from '../../users/domain/user';
  import { CLOCK, type Clock } from '../../shared/providers/clock';

  @Injectable()
  export class CompleteMpConnect {
    constructor(
      private readonly oauth: MpOAuthClient,
      @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
      @Inject(CLOCK) private readonly clock: Clock,
    ) {}

    async execute(code: string): Promise<void> {
      const t = await this.oauth.exchangeCode(code);
      await this.users.linkMpAccount(DEFAULT_USER_ID, {
        mpUserId: String(t.user_id),
        mpAccessToken: t.access_token,
        mpRefreshToken: t.refresh_token,
        mpTokenExpiresAt: new Date(this.clock.now().getTime() + t.expires_in * 1000),
        mpScope: t.scope,
        mpLiveMode: t.live_mode,
        mpConnectedAt: this.clock.now(),
      });
    }
  }
  ```
- [ ] **Step 3:** `refresh-mp-token.use-case.ts` — refreshes, or unlinks + throws `MpReauthRequiredError` on terminal failure.
  ```ts
  import { Inject, Injectable } from '@nestjs/common';
  import { MpOAuthClient, MpOAuthError } from '../providers/mp-oauth-client.provider';
  import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
  import { CLOCK, type Clock } from '../../shared/providers/clock';
  import type { User } from '../../users/domain/user';

  export class MpReauthRequiredError extends Error {
    constructor() { super('Mercado Pago re-authorization required'); this.name = 'MpReauthRequiredError'; }
  }

  @Injectable()
  export class RefreshMpToken {
    constructor(
      private readonly oauth: MpOAuthClient,
      @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
      @Inject(CLOCK) private readonly clock: Clock,
    ) {}

    /** Returns a fresh access token; refreshes if needed; unlinks + throws on terminal failure. */
    async execute(user: User): Promise<string> {
      if (!user.mpRefreshToken) throw new MpReauthRequiredError();
      try {
        const t = await this.oauth.refresh(user.mpRefreshToken);
        await this.users.updateMpTokens(user.id, {
          mpAccessToken: t.access_token,
          mpRefreshToken: t.refresh_token,
          mpTokenExpiresAt: new Date(this.clock.now().getTime() + t.expires_in * 1000),
        });
        return t.access_token;
      } catch (err) {
        if (err instanceof MpOAuthError && err.status === 400) {
          await this.users.unlinkMpAccount(user.id);
          throw new MpReauthRequiredError();
        }
        throw err;
      }
    }
  }
  ```
- [ ] **Step 4:** Commit: `feat(api): MP OAuth connect and token-refresh use-cases`.

### Task 2.3: mp-oauth.controller.ts

**Files:** Create `apps/api/src/mp/interface/mp-oauth.controller.ts`

- [ ] **Step 1:** Implement the four routes. `start` sets an httpOnly `mp_oauth_state` cookie and 302s to MP; `callback` verifies the cookie, completes the connect, and 302s to the UI; `disconnect` unlinks; `status` reports connection metadata. Use `@Res()` for redirects/cookies (Express `Response`).
  ```ts
  import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
  import type { Request, Response } from 'express';
  import { StartMpConnect } from '../use-cases/start-mp-connect.use-case';
  import { CompleteMpConnect } from '../use-cases/complete-mp-connect.use-case';
  import { GetCurrentUser } from '../../users/use-cases/get-current-user.use-case';
  import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
  import { Inject } from '@nestjs/common';
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
  ```
- [ ] **Step 2:** Cookie parsing: add `cookie-parser`. Run `bun add --filter=api cookie-parser` + `bun add --filter=api -d @types/cookie-parser`. In `main.ts` add `app.use(cookieParser())` (import `cookieParser from 'cookie-parser'`).
- [ ] **Step 3:** Create `mp.module.ts` (partial — OAuth only for now):
  ```ts
  import { Module } from '@nestjs/common';
  import { UsersModule } from '../users/users.module';
  import { SharedModule } from '../shared/shared.module';
  import { MpOAuthClient } from './providers/mp-oauth-client.provider';
  import { StartMpConnect } from './use-cases/start-mp-connect.use-case';
  import { CompleteMpConnect } from './use-cases/complete-mp-connect.use-case';
  import { RefreshMpToken } from './use-cases/refresh-mp-token.use-case';
  import { MpOAuthController } from './interface/mp-oauth.controller';

  @Module({
    imports: [UsersModule, SharedModule],
    controllers: [MpOAuthController],
    providers: [MpOAuthClient, StartMpConnect, CompleteMpConnect, RefreshMpToken],
    exports: [MpOAuthClient, RefreshMpToken],
  })
  export class MpModule {}
  ```
  Add `MpModule` to `app.module.ts`.
- [ ] **Step 4:** Boot the api; `GET /mp/oauth/status` returns `{ "connected": false }`.
- [ ] **Step 5:** Commit: `feat(api): MP OAuth controller and module`.

---

## Phase 3 — apps/ai: classifier workflow

`apps/ai`'s first Mastra `Workflow`. It takes an MP payment shape and returns a `Classification`. Two steps: `build-classification-prompt` (pure) → a classifier agent step with structured output.

### Task 3.1: Classification domain schemas

**Files:** Create `apps/ai/src/mp-classification/domain/classification.ts`

- [ ] **Step 1:** Reuse the existing `categorySchema`:
  ```ts
  import { z } from 'zod';
  import { categorySchema } from '../../shared/domain/category';

  export const classifyMpEventInput = z.object({
    kind: z.enum(['income', 'expense']),
    amount: z.number().positive(),
    merchant: z.string().nullable(),
    description: z.string().nullable(),
    counterparty: z.string().nullable(),
  });

  export const classificationSchema = z.object({
    category: categorySchema,
    suggestedDescription: z.string(),
    confidence: z.number().min(0).max(1),
  });

  export type ClassifyMpEventInput = z.infer<typeof classifyMpEventInput>;
  export type Classification = z.infer<typeof classificationSchema>;
  ```
- [ ] **Step 2:** Commit: `feat(ai): MP classification schemas`.

### Task 3.2: Classifier agent + workflow

**Files:** Create `apps/ai/src/mp-classification/workflows/classify-mp-event.workflow.ts`

- [ ] **Step 1:** Confirm the Mastra 1.x APIs first via the Mastra MCP: `createStep`, `createWorkflow().then().commit()`, `createStep(agent, { structuredOutput })`, and how an `Agent` is constructed (mirror `src/agent/gasti-agent.ts`).
- [ ] **Step 2:** Implement. Step 1 builds the prompt; step 2 is the classifier agent with structured output.
  ```ts
  import { Agent } from '@mastra/core/agent';
  import { createStep, createWorkflow } from '@mastra/core/workflows';
  import { z } from 'zod';
  import { classifyMpEventInput, classificationSchema } from '../domain/classification';

  const classifierAgent = new Agent({
    id: 'mp-classifier',
    name: 'MP Classifier',
    model: 'openai/gpt-4o',
    instructions: `You classify a single Mercado Pago payment for an Argentine personal-finance app.
Given the payment, choose exactly one category from: comida, transporte, entretenimiento, salud,
servicios, educacion, otros. Write a short neutral Spanish description (max 6 words, no emojis).
Report confidence 0..1 — how sure the category is. If the merchant/counterparty is unknown or
ambiguous, use 'otros' and a low confidence. For income payments, still pick the closest category.`,
  });

  const buildPrompt = createStep({
    id: 'build-classification-prompt',
    inputSchema: classifyMpEventInput,
    outputSchema: z.object({ prompt: z.string() }),
    execute: async ({ inputData }) => ({
      prompt: [
        `Tipo: ${inputData.kind === 'income' ? 'cobro entrante' : 'pago saliente'}`,
        `Monto: ARS ${inputData.amount}`,
        `Comercio: ${inputData.merchant ?? 'desconocido'}`,
        `Descripción MP: ${inputData.description ?? 'ninguna'}`,
        `Contraparte: ${inputData.counterparty ?? 'desconocida'}`,
      ].join('\n'),
    }),
  });

  const classifyStep = createStep(classifierAgent, { structuredOutput: { schema: classificationSchema } });

  export const classifyMpEventWorkflow = createWorkflow({
    id: 'classify-mp-event',
    inputSchema: classifyMpEventInput,
    outputSchema: classificationSchema,
  })
    .then(buildPrompt)
    .then(classifyStep)
    .commit();
  ```
- [ ] **Step 3:** Register in `apps/ai/src/mastra/index.ts` — add `workflows: { classifyMpEvent: classifyMpEventWorkflow }` to the `new Mastra({...})` config (import the workflow at the top).
- [ ] **Step 4:** Run `bun dev --filter=ai`; open the Mastra dev playground; confirm `classify-mp-event` appears under Workflows and a manual run with a sample payment returns a valid `Classification`.
- [ ] **Step 5:** Confirm the HTTP route the Mastra server exposes to run this workflow (via the Mastra MCP — `reference/server` / client-js). Record the exact URL + request/response shape in a comment at the top of the workflow file; Phase 4's `http-payment-classifier` depends on it.
- [ ] **Step 6:** Commit: `feat(ai): Mercado Pago payment classifier workflow`.

---

## Phase 4 — apps/api: MP webhook receiver + classifier integration

### Task 4.1: Domain helpers — `isCompletedPayment`, `mapMpStatus`

**Files:** Create `apps/api/src/mp/domain/{mp-payment.ts,is-completed-payment.ts,map-mp-status.ts}` + tests

- [ ] **Step 1:** `mp-payment.ts` — a minimal local `MpPayment` shape (don't depend on the SDK's internal `commonTypes` path; type only what we read):
  ```ts
  export interface MpPayment {
    id: number | string;
    status: 'pending' | 'approved' | 'authorized' | 'in_process' | 'in_mediation'
      | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';
    status_detail: string;
    captured?: boolean;
    transaction_amount: number;
    description?: string | null;
    date_approved?: string | null;
    date_created?: string | null;
    collector_id?: number | null;
    payer?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
    additional_info?: { items?: Array<{ title?: string }> | null } | null;
  }
  ```
- [ ] **Step 2: Write failing tests** `is-completed-payment.test.ts` and `map-mp-status.test.ts`:
  ```ts
  // is-completed-payment.test.ts
  import { test, expect } from 'bun:test';
  import { isCompletedPayment } from './is-completed-payment';
  const base = { status_detail: 'accredited', captured: true } as const;
  test('approved + accredited + captured is completed', () => {
    expect(isCompletedPayment({ ...base, status: 'approved' } as any)).toBe(true);
  });
  test('pending is not completed', () => {
    expect(isCompletedPayment({ ...base, status: 'pending' } as any)).toBe(false);
  });
  test('approved but not captured is not completed', () => {
    expect(isCompletedPayment({ ...base, status: 'approved', captured: false } as any)).toBe(false);
  });
  ```
  ```ts
  // map-mp-status.test.ts
  import { test, expect } from 'bun:test';
  import { mapMpStatusToTransactionStatus } from './map-mp-status';
  test('refunded maps to refunded', () => {
    expect(mapMpStatusToTransactionStatus('refunded')).toBe('refunded');
  });
  test('charged_back maps to charged_back', () => {
    expect(mapMpStatusToTransactionStatus('charged_back')).toBe('charged_back');
  });
  test('approved maps to active', () => {
    expect(mapMpStatusToTransactionStatus('approved')).toBe('active');
  });
  ```
- [ ] **Step 3:** Run both — expect FAIL.
- [ ] **Step 4: Implement.**
  ```ts
  // is-completed-payment.ts
  import type { MpPayment } from './mp-payment';
  export const isCompletedPayment = (p: MpPayment): boolean =>
    p.status === 'approved' && p.status_detail === 'accredited' && p.captured !== false;
  ```
  ```ts
  // map-mp-status.ts
  import type { MpPayment } from './mp-payment';
  import type { TransactionStatus } from '../../shared/domain/transaction';
  export const mapMpStatusToTransactionStatus = (s: MpPayment['status']): TransactionStatus => {
    if (s === 'refunded') return 'refunded';
    if (s === 'charged_back') return 'charged_back';
    return 'active';
  };
  ```
  > `TransactionStatus` is added to `transaction.ts` in Phase 6. If executing strictly in order, temporarily inline the union here and replace the import in Phase 6 — or do Task 6.1 (schema extension) before this task.
- [ ] **Step 5:** Run tests — expect PASS.
- [ ] **Step 6:** Commit: `feat(api): MP payment domain helpers`.

### Task 4.2: Domain interfaces — classification, payment source, classifier

**Files:** Create `apps/api/src/mp/domain/{classification.ts,mp-payment-source.ts,payment-classifier.ts}`

- [ ] **Step 1:** `classification.ts`:
  ```ts
  import type { ExpenseCategory } from '../../proactive/domain/pending-prompt';
  export interface Classification {
    readonly category: ExpenseCategory;
    readonly suggestedDescription: string;
    readonly confidence: number;
  }
  ```
  > `ExpenseCategory` is defined in `pending-prompt.ts` (Phase 5). Either do Task 5.1 first, or import the existing `Category` from `shared/domain/category.ts` (same union) and alias it. **Recommendation:** reuse `shared/domain/category.ts`'s `Category` everywhere instead of a separate `ExpenseCategory` — note this divergence from the spec, it's simpler.
- [ ] **Step 2:** `mp-payment-source.ts` + `payment-classifier.ts` (interfaces + tokens):
  ```ts
  // mp-payment-source.ts
  import type { MpPayment } from './mp-payment';
  export const MP_PAYMENT_SOURCE = 'MP_PAYMENT_SOURCE';
  export interface MpPaymentSource {
    getById(paymentId: string, userId: string): Promise<MpPayment>;
  }
  ```
  ```ts
  // payment-classifier.ts
  import type { Classification } from './classification';
  import type { Category } from '../../shared/domain/category';
  export const PAYMENT_CLASSIFIER = 'PAYMENT_CLASSIFIER';
  export interface ClassifyArgs {
    readonly kind: 'income' | 'expense';
    readonly amount: number;
    readonly merchant: string | null;
    readonly description: string | null;
    readonly counterparty: string | null;
  }
  export interface PaymentClassifier {
    classify(args: ClassifyArgs): Promise<Classification>;
  }
  export const FALLBACK_CLASSIFICATION = (merchant: string | null): Classification => ({
    category: 'otros' as Category,
    suggestedDescription: merchant ?? 'Movimiento de Mercado Pago',
    confidence: 0,
  });
  ```
- [ ] **Step 3:** Commit: `feat(api): MP domain interfaces`.

### Task 4.3: MercadoPago provider (MpPaymentSource)

**Files:** Create `apps/api/src/mp/providers/mercado-pago.provider.ts`

- [ ] **Step 1:** Implement `getById` — fetch `GET https://api.mercadopago.com/v1/payments/:id` with the user's access token; on 401, refresh once via `RefreshMpToken` and retry; on 429/5xx, backoff 3× (250/1000/4000 ms). Depends on `UsersRepository` + `RefreshMpToken`.
  ```ts
  import { Inject, Injectable, Logger } from '@nestjs/common';
  import type { MpPayment } from '../domain/mp-payment';
  import type { MpPaymentSource } from '../domain/mp-payment-source';
  import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
  import { RefreshMpToken } from '../use-cases/refresh-mp-token.use-case';
  import { isMpTokenExpired } from '../../users/domain/user';

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const BACKOFF = [250, 1000, 4000];

  @Injectable()
  export class MercadoPagoProvider implements MpPaymentSource {
    private readonly log = new Logger(MercadoPagoProvider.name);
    constructor(
      @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
      private readonly refresh: RefreshMpToken,
    ) {}

    async getById(paymentId: string, userId: string): Promise<MpPayment> {
      let user = await this.users.getCurrent();
      let token = isMpTokenExpired(user)
        ? await this.refresh.execute(user)
        : user.mpAccessToken!;

      for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.ok) return (await res.json()) as MpPayment;
        if (res.status === 401 && attempt === 0) {
          user = await this.users.getCurrent();
          token = await this.refresh.execute(user);
          continue;
        }
        if (res.status === 429 || res.status >= 500) {
          if (attempt < BACKOFF.length) { await sleep(BACKOFF[attempt]); continue; }
        }
        throw new Error(`MP payment fetch failed: HTTP ${res.status}`);
      }
      throw new Error('MP payment fetch failed: retries exhausted');
    }
  }
  ```
- [ ] **Step 2:** Commit: `feat(api): Mercado Pago payment source provider`.

### Task 4.4: HTTP payment classifier (calls apps/ai)

**Files:** Create `apps/api/src/mp/providers/http-payment-classifier.ts`

- [ ] **Step 1:** Implement `PaymentClassifier` — POST the classifier workflow on `apps/ai` (URL/shape confirmed in Task 3.5), retry once at 500  ms, fall back to `FALLBACK_CLASSIFICATION` on any failure or invalid response.
  ```ts
  import { Injectable, Logger } from '@nestjs/common';
  import type { ClassifyArgs, PaymentClassifier } from '../domain/payment-classifier';
  import { FALLBACK_CLASSIFICATION } from '../domain/payment-classifier';
  import type { Classification } from '../domain/classification';

  const AI_BASE = process.env.AI_BASE_URL?.trim() || 'http://localhost:4111';

  @Injectable()
  export class HttpPaymentClassifier implements PaymentClassifier {
    private readonly log = new Logger(HttpPaymentClassifier.name);

    async classify(args: ClassifyArgs): Promise<Classification> {
      try {
        return await this.attempt(args);
      } catch {
        await new Promise((r) => setTimeout(r, 500));
        try {
          return await this.attempt(args);
        } catch (err) {
          this.log.warn(`classifier unreachable, using fallback: ${String(err)}`);
          return FALLBACK_CLASSIFICATION(args.merchant);
        }
      }
    }

    private async attempt(args: ClassifyArgs): Promise<Classification> {
      // URL + body + result-extraction confirmed in Task 3.5 against the Mastra MCP.
      const res = await fetch(`${AI_BASE}/api/workflows/classify-mp-event/start-async`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputData: args }),
      });
      if (!res.ok) throw new Error(`classifier HTTP ${res.status}`);
      const json = (await res.json()) as { status?: string; result?: Classification };
      if (json.status !== 'success' || !json.result) throw new Error('classifier returned no result');
      return json.result;
    }
  }
  ```
  > The endpoint path and the `{ inputData }` / `{ status, result }` envelope are placeholders — **confirm them in Task 3.5 and correct here before running.**
- [ ] **Step 2:** Commit: `feat(api): HTTP payment classifier with fallback`.

### Task 4.5: MpSignatureVerifier

**Files:** Create `apps/api/src/mp/providers/mp-signature-verifier.ts` + test

- [ ] **Step 1: Write the failing test.** MP's webhook signature is an HMAC-SHA256 over a template string `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` keyed by `MP_WEBHOOK_SECRET`, compared to the `v1=` part of the `x-signature` header.
  ```ts
  import { test, expect } from 'bun:test';
  import { createHmac } from 'node:crypto';
  import { createMpSignatureVerifier } from './mp-signature-verifier';

  const SECRET = 'whsec_test';
  function sign(dataId: string, requestId: string, ts: string): string {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    return createHmac('sha256', SECRET).update(manifest).digest('hex');
  }

  test('accepts a correctly signed webhook', () => {
    const verify = createMpSignatureVerifier(SECRET);
    const v1 = sign('PAY_1', 'req_1', '1747200000');
    expect(verify({ xSignature: `ts=1747200000,v1=${v1}`, xRequestId: 'req_1', dataId: 'PAY_1' })).toBe(true);
  });

  test('rejects a tampered signature', () => {
    const verify = createMpSignatureVerifier(SECRET);
    expect(verify({ xSignature: 'ts=1747200000,v1=deadbeef', xRequestId: 'req_1', dataId: 'PAY_1' })).toBe(false);
  });

  test('rejects a malformed header', () => {
    const verify = createMpSignatureVerifier(SECRET);
    expect(verify({ xSignature: 'garbage', xRequestId: 'req_1', dataId: 'PAY_1' })).toBe(false);
  });
  ```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3: Implement** (use `crypto.timingSafeEqual`):
  ```ts
  import { createHmac, timingSafeEqual } from 'node:crypto';

  export interface SignatureInput {
    xSignature: string | undefined;
    xRequestId: string | undefined;
    dataId: string;
  }
  export type MpSignatureVerifier = (input: SignatureInput) => boolean;

  export function createMpSignatureVerifier(secret: string): MpSignatureVerifier {
    return ({ xSignature, xRequestId, dataId }) => {
      if (!xSignature || !xRequestId) return false;
      const parts = Object.fromEntries(
        xSignature.split(',').map((p) => p.split('=').map((s) => s.trim()) as [string, string]),
      );
      const ts = parts.ts;
      const v1 = parts.v1;
      if (!ts || !v1) return false;
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
      const expected = createHmac('sha256', secret).update(manifest).digest('hex');
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(v1, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    };
  }
  ```
- [ ] **Step 4:** Run — expect PASS. **Confirm MP's exact manifest template via the MP MCP** (the `id`/`request-id`/`ts` ordering is documented; correct it here if needed).
- [ ] **Step 5:** Commit: `feat(api): Mercado Pago webhook signature verifier`.

### Task 4.6: Webhook DTO + schema + controller skeleton

**Files:** Create `apps/api/src/mp/interface/{mp-webhook.dto.ts,mp.schemas.ts,mp-webhook.controller.ts}`

- [ ] **Step 1:** `mp-webhook.dto.ts` — the inbound body interface (from spec §4). `mp.schemas.ts` — a Zod schema for it (lenient: MP sends extra fields).
  ```ts
  // mp.schemas.ts
  import { z } from 'zod';
  export const mpWebhookBody = z.object({
    type: z.string(),
    action: z.string().optional(),
    data: z.object({ id: z.string() }),
    user_id: z.union([z.number(), z.string()]).optional(),
    live_mode: z.boolean().optional(),
  }).passthrough();
  export type MpWebhookBody = z.infer<typeof mpWebhookBody>;
  ```
- [ ] **Step 2:** `mp-webhook.controller.ts` — verify signature → parse → **return 200 immediately** → fire-and-forget `ProcessMpEvent`. (`ProcessMpEvent` arrives in Phase 7; for now leave a `// TODO Phase 7` and just 200.) Drop non-`payment` types with 200.
  ```ts
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
  ```
  > Signature-mismatch returns 200 here (not 401) deliberately — the spec's table says 401, but a 401 makes MP retry. Decide during review; the safe default that still satisfies "don't act on it" is 200 + an error log. Note this divergence for the reviewer.
- [ ] **Step 3:** Register `MpWebhookController` in `MpModule` `controllers`.
- [ ] **Step 4:** Commit: `feat(api): MP webhook controller skeleton`.

---

## Phase 5 — apps/api: proactive state + SSE

### Task 5.1: PendingPrompt domain

**Files:** Create `apps/api/src/proactive/domain/pending-prompt.ts`

- [ ] **Step 1:**
  ```ts
  import type { Category } from '../../shared/domain/category';

  export type PaymentKind = 'income' | 'expense';
  export type PendingPromptStatus = 'pending' | 'added' | 'discarded' | 'auto';
  export type ProactiveIntent = 'confirm' | 'notice';
  export type NoticeReason = 'mp_refund' | 'mp_chargeback';

  export interface PendingPrompt {
    readonly id: string;
    readonly userId: string;
    readonly mpPaymentId: string;
    readonly kind: PaymentKind;
    readonly amount: number;
    readonly merchant: string | null;
    readonly paymentDate: string;             // ISO
    readonly suggestedCategory: Category;
    readonly suggestedDescription: string;
    readonly confidence: number;
    readonly intent: ProactiveIntent;
    readonly noticeReason: NoticeReason | null;
    readonly status: PendingPromptStatus;
    readonly resolvedTransactionId: string | null;
    readonly createdAt: string;               // ISO
    readonly resolvedAt: string | null;       // ISO
  }
  ```
- [ ] **Step 2:** Commit.

### Task 5.2: Repository + event-bus interfaces

**Files:** Create `apps/api/src/proactive/domain/{pending-prompts.repository.ts,proactive-event-bus.ts}`

- [ ] **Step 1:** `pending-prompts.repository.ts`:
  ```ts
  import type { NoticeReason, PendingPrompt } from './pending-prompt';

  export const PENDING_PROMPTS_REPOSITORY = 'PENDING_PROMPTS_REPOSITORY';
  export type NewPendingPrompt = Omit<PendingPrompt, 'resolvedTransactionId' | 'resolvedAt'>;

  export interface PendingPromptsRepository {
    create(p: NewPendingPrompt): Promise<PendingPrompt>;
    findByMpPaymentId(userId: string, mpPaymentId: string): Promise<PendingPrompt | null>;
    listPending(userId: string): Promise<PendingPrompt[]>;
    getById(userId: string, id: string): Promise<PendingPrompt | null>;
    markAdded(id: string, txId: string): Promise<void>;
    markDiscarded(id: string, reason?: NoticeReason): Promise<void>;
  }
  ```
- [ ] **Step 2:** `proactive-event-bus.ts`:
  ```ts
  import type { PendingPrompt } from './pending-prompt';
  export const PROACTIVE_EVENT_BUS = 'PROACTIVE_EVENT_BUS';
  export interface ProactiveEventBus {
    publish(userId: string, prompt: PendingPrompt): void;
    subscribe(userId: string, fn: (p: PendingPrompt) => void): () => void;
  }
  ```
- [ ] **Step 3:** Commit.

### Task 5.3: JSON pending-prompts repository

**Files:** Create `apps/api/src/proactive/repositories/json-pending-prompts.repository.ts`

- [ ] **Step 1:** Mirror `json-budgets.repository.ts` shape. `listPending` returns prompts with status `pending` **plus** recent `auto` notices (so notices survive a reload), newest first.
  ```ts
  import { Injectable } from '@nestjs/common';
  import { randomUUID } from 'node:crypto';
  import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
  import { PENDING_PROMPTS_FILE } from '../../shared/providers/paths';
  import type { PendingPrompt, NoticeReason } from '../domain/pending-prompt';
  import type { NewPendingPrompt, PendingPromptsRepository } from '../domain/pending-prompts.repository';

  @Injectable()
  export class JsonPendingPromptsRepository implements PendingPromptsRepository {
    private readonly store: JsonStore<PendingPrompt[]> =
      createJsonStore<PendingPrompt[]>(PENDING_PROMPTS_FILE, []);

    async create(p: NewPendingPrompt): Promise<PendingPrompt> {
      const prompt: PendingPrompt = { ...p, id: `pp_${randomUUID()}`, resolvedTransactionId: null, resolvedAt: null };
      const all = await this.store.read();
      all.push(prompt);
      await this.store.write(all);
      return prompt;
    }

    async findByMpPaymentId(userId: string, mpPaymentId: string): Promise<PendingPrompt | null> {
      const all = await this.store.read();
      return all.find((p) => p.userId === userId && p.mpPaymentId === mpPaymentId) ?? null;
    }

    async listPending(userId: string): Promise<PendingPrompt[]> {
      const all = await this.store.read();
      return all
        .filter((p) => p.userId === userId && (p.status === 'pending' || p.status === 'auto'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    async getById(userId: string, id: string): Promise<PendingPrompt | null> {
      const all = await this.store.read();
      return all.find((p) => p.userId === userId && p.id === id) ?? null;
    }

    private async patch(id: string, fields: Partial<PendingPrompt>): Promise<void> {
      const all = await this.store.read();
      const i = all.findIndex((p) => p.id === id);
      if (i === -1) return;
      all[i] = { ...all[i], ...fields };
      await this.store.write(all);
    }

    markAdded(id: string, txId: string): Promise<void> {
      return this.patch(id, { status: 'added', resolvedTransactionId: txId, resolvedAt: new Date().toISOString() });
    }

    markDiscarded(id: string, _reason?: NoticeReason): Promise<void> {
      return this.patch(id, { status: 'discarded', resolvedAt: new Date().toISOString() });
    }
  }
  ```
- [ ] **Step 2:** Commit: `feat(api): JSON pending-prompts repository`.

### Task 5.4: In-memory event bus

**Files:** Create `apps/api/src/proactive/providers/in-memory-proactive-event-bus.ts`

- [ ] **Step 1:** Implement exactly as spec §10 (`@Injectable()`, `Map<string, Set<fn>>`).
- [ ] **Step 2:** Commit: `feat(api): in-memory proactive event bus`.

### Task 5.5: list-pending-prompts use-case + proactive controller (stream + pending)

**Files:** Create `apps/api/src/proactive/use-cases/list-pending-prompts.use-case.ts`, `apps/api/src/proactive/interface/proactive.controller.ts`, `apps/api/src/proactive/proactive.module.ts`

- [ ] **Step 1:** `list-pending-prompts.use-case.ts` — inject `PENDING_PROMPTS_REPOSITORY` + `CurrentUserProvider`; return `listPending(user.id)`.
- [ ] **Step 2:** `proactive.controller.ts` — `GET /proactive/pending` returns `{ prompts }`; `GET /proactive/stream` is SSE. For SSE use NestJS's `@Sse()` decorator returning an RxJS `Observable<MessageEvent>`, bridged from `ProactiveEventBus.subscribe`. Confirm `@Sse()` usage in the Nest docs; the shape:
  ```ts
  import { Controller, Get, Inject, Sse, MessageEvent } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { ListPendingPrompts } from '../use-cases/list-pending-prompts.use-case';
  import { PROACTIVE_EVENT_BUS, type ProactiveEventBus } from '../domain/proactive-event-bus';
  import { CurrentUserProvider } from '../../users/providers/current-user.provider';

  @Controller('proactive')
  export class ProactiveController {
    constructor(
      private readonly listPending: ListPendingPrompts,
      @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
      private readonly currentUser: CurrentUserProvider,
    ) {}

    @Get('pending')
    async pending() {
      return { prompts: await this.listPending.execute() };
    }

    @Sse('stream')
    async stream(): Promise<Observable<MessageEvent>> {
      const user = await this.currentUser.resolve();
      return new Observable<MessageEvent>((subscriber) => {
        const off = this.bus.subscribe(user.id, (prompt) =>
          subscriber.next({ type: 'prompt.created', data: prompt } as MessageEvent),
        );
        return () => off();
      });
    }
  }
  ```
- [ ] **Step 3:** `proactive.module.ts` — wire repo, bus, use-case, controller; import `UsersModule`; **export** `PENDING_PROMPTS_REPOSITORY` and `PROACTIVE_EVENT_BUS` (Phase 7 needs them).
- [ ] **Step 4:** Add `ProactiveModule` to `app.module.ts`. Boot; `GET /proactive/pending` → `{ "prompts": [] }`; `GET /proactive/stream` holds the connection open.
- [ ] **Step 5:** Commit: `feat(api): proactive pending + SSE stream`.

---

## Phase 6 — apps/api: transactions extension

> Do Task 6.1 before Phase 4 if executing strictly in order — Phase 4 imports `TransactionStatus`.

### Task 6.1: Extend the Transaction schema

**Files:** Modify `apps/api/src/shared/domain/transaction.ts`

- [ ] **Step 1:** Extend `transactionSchema` with the six MP fields, each with `.default(...)`:
  ```ts
  import { z } from 'zod';
  import { categorySchema } from './category';

  export const transactionDirection = z.enum(['expense', 'income']);
  export const transactionStatusSchema = z.enum(['active', 'refunded', 'charged_back']);
  export const transactionSource = z.enum(['manual', 'mp_webhook']);

  export const transactionSchema = z.object({
    id: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.number().positive(),
    currency: z.literal('ARS'),
    category: categorySchema,
    description: z.string(),
    merchant: z.string(),
    userId: z.string().default('default-user'),
    direction: transactionDirection.default('expense'),
    status: transactionStatusSchema.default('active'),
    statusChangedAt: z.string().nullable().default(null),
    source: transactionSource.default('manual'),
    mpPaymentId: z.string().nullable().default(null),
  });

  export type Transaction = z.infer<typeof transactionSchema>;
  export type TransactionDirection = z.infer<typeof transactionDirection>;
  export type TransactionStatus = z.infer<typeof transactionStatusSchema>;
  export type TransactionSource = z.infer<typeof transactionSource>;
  ```
  > `z.infer` of a `.default()` field is **required** in the output type. Object literals that construct a `Transaction` must now supply all 13 fields — only `add.use-case.ts` and `fakes.ts` do. Readers are unaffected.
- [ ] **Step 2:** Typecheck `apps/api`. Fix the two construction sites (Tasks 6.4, 6.6).
- [ ] **Step 3:** Commit after the suite is green (end of Phase 6).

### Task 6.2: Extend the TransactionsRepository interface

**Files:** Modify `apps/api/src/transactions/domain/transactions.repository.ts`

- [ ] **Step 1:** Add three methods to the existing interface:
  ```ts
  getById(userId: string, id: string): Promise<Transaction | null>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<Transaction | null>;
  updateStatus(id: string, newStatus: TransactionStatus, at: Date): Promise<void>;
  ```
  Import `TransactionStatus` from `shared/domain/transaction`.

### Task 6.3: Extend JsonTransactionsRepository — normalize-on-read + new methods

**Files:** Modify `apps/api/src/transactions/repositories/json-transactions.repository.ts`

- [ ] **Step 1:** Change `all()` to parse each raw row through `transactionSchema` so the existing `data/transactions.json` (7-field rows) is upgraded to 13-field rows in memory:
  ```ts
  async all(): Promise<Transaction[]> {
    const raw = await this.store.read();
    return (raw as unknown[]).map((r) => transactionSchema.parse(r));
  }
  ```
  (Keep the store generic as `unknown[]` or `Transaction[]`; the parse is the contract.)
- [ ] **Step 2:** Implement `getById`, `findByMpPaymentId` (filter on the normalized list), `updateStatus` (read-modify-write, set `status` + `statusChangedAt`).
- [ ] **Step 3:** `nextId` already yields `txn_NNN`; MP-sourced transactions reuse it.

### Task 6.4: Update add.use-case.ts

**Files:** Modify `apps/api/src/transactions/use-cases/add.use-case.ts`

- [ ] **Step 1:** Widen `AddTransactionInput` with optional MP fields and apply defaults when building the `Transaction` literal:
  ```ts
  export interface AddTransactionInput {
    date?: string;
    amount: number;
    category?: Category;
    description: string;
    merchant: string;
    userId?: string;
    direction?: TransactionDirection;
    source?: TransactionSource;
    mpPaymentId?: string | null;
  }
  // ...in execute(), build the tx with:
  //   userId: input.userId ?? 'default-user',
  //   direction: input.direction ?? 'expense',
  //   status: 'active', statusChangedAt: null,
  //   source: input.source ?? 'manual',
  //   mpPaymentId: input.mpPaymentId ?? null,
  ```
- [ ] **Step 2:** The existing `add.use-case.test.ts` still passes (defaults cover the new fields). Run it.

### Task 6.5: mark-transaction-reversed use-case

**Files:** Create `apps/api/src/transactions/use-cases/mark-transaction-reversed.use-case.ts`

- [ ] **Step 1:**
  ```ts
  import { Inject, Injectable } from '@nestjs/common';
  import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from '../domain/transactions.repository';
  import { CLOCK, type Clock } from '../../shared/providers/clock';
  import type { TransactionStatus } from '../../shared/domain/transaction';

  @Injectable()
  export class MarkTransactionReversed {
    constructor(
      @Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository,
      @Inject(CLOCK) private readonly clock: Clock,
    ) {}
    async execute(input: { transactionId: string; newStatus: TransactionStatus }): Promise<void> {
      await this.repo.updateStatus(input.transactionId, input.newStatus, this.clock.now());
    }
  }
  ```
- [ ] **Step 2:** Register `MarkTransactionReversed` in `transactions.module.ts` `providers` and `exports`.

### Task 6.6: Update fakes + run the whole suite

**Files:** Modify `apps/api/src/shared/testing/fakes.ts`

- [ ] **Step 1:** Update `fakeTransactionsRepo` — the seed mapper `({ ...t })` keeps extra fields; add the three new methods (`getById`, `findByMpPaymentId`, `updateStatus`) to the returned object so it still satisfies `TransactionsRepository`.
- [ ] **Step 2:** Run the **entire** `apps/api` suite: `bun test` from `apps/api`. Every test must pass.
- [ ] **Step 3:** Commit: `feat(api): extend Transaction with MP direction/status/source fields`.

---

## Phase 7 — apps/api: the orchestrator (ProcessMpEvent)

### Task 7.1: ProcessMpEvent use-case (TDD)

**Files:** Create `apps/api/src/mp/use-cases/process-mp-event.use-case.ts` + test

- [ ] **Step 1: Write failing tests** with in-memory fakes covering the three branches (spec §5):
  - **Branch 3 (new completed payment):** unknown payment → classifier called → confirm prompt created with status `pending` → bus published.
  - **Branch 1 (reversal of an existing tx):** existing tx + `refunded` payment → `updateStatus` called → `auto`/`notice` prompt created with `mpPaymentId` suffixed `:reversal` → bus published.
  - **Branch 2 (refund before prompt shown):** no tx, payment not completed, a pending prompt exists, status `refunded` → prompt `markDiscarded`.
  - **Idempotency:** duplicate `mpPaymentId` already pending → no second prompt.
  - **Unknown `mpUserId`:** `findByMpUserId` → null → drop, nothing happens.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3: Implement** `ProcessMpEvent.execute({ paymentId, mpUserId })` exactly per spec §5's three branches. Deps (all injected): `UsersRepository`, `MP_PAYMENT_SOURCE`, `PAYMENT_CLASSIFIER`, `TRANSACTIONS_REPOSITORY`, `PENDING_PROMPTS_REPOSITORY`, `PROACTIVE_EVENT_BUS`, `AddTransaction` (for income? no — income/expense both become prompts; the tx is only created on resolve), `MarkTransactionReversed`, `CLOCK`. Compute `kind` from `payment.collector_id === Number(user.mpUserId)`. On classifier failure the provider already returns the fallback, so `classify` never throws.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat(api): ProcessMpEvent orchestrator`.

### Task 7.2: Wire ProcessMpEvent into the webhook controller + MpModule

**Files:** Modify `apps/api/src/mp/interface/mp-webhook.controller.ts`, `apps/api/src/mp/mp.module.ts`

- [ ] **Step 1:** In the controller, replace the `// TODO Phase 7` with a fire-and-forget call: `void this.processMpEvent.execute({ paymentId: body.data.id, mpUserId: String(body.user_id) }).catch((e) => this.log.error(e));`. Return 200 first.
- [ ] **Step 2:** `MpModule` now wires every MP provider/use-case and imports `UsersModule`, `ProactiveModule`, `TransactionsModule`, `SharedModule`. Provide `{ provide: MP_PAYMENT_SOURCE, useClass: MercadoPagoProvider }` and `{ provide: PAYMENT_CLASSIFIER, useClass: HttpPaymentClassifier }`.
- [ ] **Step 3:** Boot the api — no DI errors. Commit: `feat(api): wire ProcessMpEvent into the webhook`.

---

## Phase 8 — apps/api: ResolveProactivePrompt + final wiring

### Task 8.1: ResolveProactivePrompt use-case (TDD)

**Files:** Create `apps/api/src/proactive/use-cases/resolve-proactive-prompt.use-case.ts` + test

- [ ] **Step 1: Write failing tests:**
  - `add` (no overrides): prompt must be `pending`+`confirm` → `AddTransaction` called with `source: 'mp_webhook'`, `direction: kind`, `mpPaymentId` → `markAdded` → returns `{ prompt, transaction }`.
  - `add` with `overrides` (category + description): the overridden values are persisted.
  - `add` with `overrides.rememberMerchantCategory`: `OverrideMerchantCategory` use-case also called.
  - `discard`: `markDiscarded`, no transaction, returns `{ prompt, transaction: null }`.
  - Already-resolved prompt: idempotent — returns the prompt as-is, creates nothing.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3: Implement.** Deps: `PENDING_PROMPTS_REPOSITORY`, `AddTransaction`, `MarkTransactionReversed` (no), the categorization override use-case (`OverrideMerchant`), `CurrentUserProvider`. Load the prompt; guard `status === 'pending' && intent === 'confirm'`; on `add` build the `AddTransactionInput` from the prompt + overrides; call `add`, then `markAdded`. Order: `AddTransaction` first, then `markAdded` — both individually idempotent (re-resolve sees `status !== 'pending'` and returns early).
- [ ] **Step 4:** Run — expect PASS. Commit: `feat(api): ResolveProactivePrompt use-case`.

### Task 8.2: proactive resolve route + schemas

**Files:** Modify `apps/api/src/proactive/interface/proactive.controller.ts`; create `apps/api/src/proactive/interface/proactive.schemas.ts`

- [ ] **Step 1:** `proactive.schemas.ts` — Zod for the resolve body: a discriminated union on `action` (`'add'` with optional `overrides`, `'discard'`).
- [ ] **Step 2:** Add `POST :id/resolve` to the controller using `ZodValidationPipe`; call `ResolveProactivePrompt`; on resolve, publish a `prompt.resolved` event on the bus so other tabs update.
- [ ] **Step 3:** Extend the SSE stream to emit both `prompt.created` and `prompt.resolved` (the bus already carries the full prompt; the `data` is the prompt, the event `type` reflects its `status`).
- [ ] **Step 4:** Wire `ResolveProactivePrompt` into `ProactiveModule`; import `TransactionsModule` + `CategorizationModule` (the override use-case lives there — check its exact name/module and export it if not already exported).
- [ ] **Step 5:** Boot; manually `POST /proactive/<id>/resolve` against a hand-seeded `pending-prompts.json`. Commit: `feat(api): proactive prompt resolution endpoint`.

### Task 8.3: API integration smoke

- [ ] **Step 1:** With the api running, walk: `GET /mp/oauth/status`, `GET /proactive/pending`, `GET /proactive/stream`. Confirm no DI errors and the existing feature endpoints still respond.
- [ ] **Step 2:** Run the full `apps/api` `bun test` suite — all green.
- [ ] **Step 3:** Commit if anything changed.

---

## Phase 9 — apps/ui: composer chip + MP connection

### Task 9.1: MP connection domain + repository

**Files:** Create `apps/ui/src/mp/domain/mp-connection.ts`, `apps/ui/src/mp/repositories/http-mp-repository.ts`

- [ ] **Step 1:** `mp-connection.ts`:
  ```ts
  export type MpConnection =
    | { connected: false }
    | { connected: true; mpUserIdLast4: string; connectedAt: string };

  export interface MpRepository {
    getStatus(): Promise<MpConnection>;
    startConnectUrl(): string;     // full URL to navigate to
    disconnect(): Promise<void>;
  }
  ```
- [ ] **Step 2:** `http-mp-repository.ts` — reads `process.env.NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`); `startConnectUrl()` returns `${base}/mp/oauth/start`; `getStatus` GETs `/mp/oauth/status` with `credentials: 'include'`; `disconnect` POSTs `/mp/oauth/disconnect`.
- [ ] **Step 3:** Commit: `feat(ui): MP connection domain and HTTP repository`.

### Task 9.2: useMpConnection hook

**Files:** Create `apps/ui/src/mp/infrastructure/use-mp-connection.ts`

- [ ] **Step 1:** `'use client'` hook: holds `MpConnection` state, fetches status on mount, exposes `connect()` (`window.location.href = repo.startConnectUrl()`), `disconnect()` (calls repo, refetches), and re-reads status when the URL has `?mp=connected` (the OAuth callback redirect). Keep the repo in a `useMemo`.
- [ ] **Step 2:** Commit: `feat(ui): useMpConnection hook`.

### Task 9.3: MercadoPagoChip + popover

**Files:** Create `apps/ui/src/mp/components/{mercado-pago-chip.tsx,mp-connection-popover.tsx}`

- [ ] **Step 1:** `mercado-pago-chip.tsx` — `'use client'`, uses `useMpConnection`. Disconnected: a pill (`rounded-pill`, `bg-surface-tint`, `border-line-1`, `text-ai-ink`) with a Lucide `Wallet` icon (16px) + "Conectá Mercado Pago" — click → `connect()`. Connected: same pill, label "Mercado Pago", a 4px `--pos` dot; click toggles `<MpConnectionPopover>`. All classes from DESIGN.md tokens (see spec §8).
- [ ] **Step 2:** `mp-connection-popover.tsx` — frosted `Card` (`variant="frosted"`, `radius="lg"`) showing `mpUserIdLast4`, `connectedAt`, and a "Desconectar" `Button variant="ghost"`.
- [ ] **Step 3:** Commit: `feat(ui): Mercado Pago composer chip and popover`.

### Task 9.4: Composer chip row

**Files:** Modify `apps/ui/src/chat/components/composer.tsx`

- [ ] **Step 1:** Restructure the composer from a single `rounded-pill` form into a vertical stack: the textarea row on top, a chip row below holding `<MercadoPagoChip />` and the send button (spec §8). Change the outer container radius to `rounded-lg`. Keep all existing props/behaviour (`onSubmit`, `state`, keyboard handling) unchanged.
- [ ] **Step 2:** Verify in the browser (`bun dev --filter=ui`): composer renders with the chip; clicking the chip while disconnected navigates to the api OAuth start.
- [ ] **Step 3:** Commit: `feat(ui): composer chip row with Mercado Pago chip`.

---

## Phase 10 — apps/ui: proactive cards + thread integration

### Task 10.1: Proactive domain + repository

**Files:** Create `apps/ui/src/proactive/domain/{pending-prompt.ts,proactive-repository.ts}`

- [ ] **Step 1:** `pending-prompt.ts` — mirror the api `PendingPrompt` shape (UI-side type).
- [ ] **Step 2:** `proactive-repository.ts`:
  ```ts
  import type { PendingPrompt } from './pending-prompt';
  export type ProactiveEvent =
    | { kind: 'created'; prompt: PendingPrompt }
    | { kind: 'resolved'; prompt: PendingPrompt };
  export interface ResolveInput {
    action: 'add' | 'discard';
    overrides?: { category?: string; description?: string; rememberMerchantCategory?: boolean };
  }
  export interface ProactiveRepository {
    listPending(): Promise<PendingPrompt[]>;
    stream(onEvent: (e: ProactiveEvent) => void): () => void;  // returns unsubscribe
    resolve(id: string, input: ResolveInput): Promise<PendingPrompt>;
  }
  ```
- [ ] **Step 3:** Commit.

### Task 10.2: HTTP proactive repository (SSE + REST)

**Files:** Create `apps/ui/src/proactive/repositories/http-proactive-repository.ts`

- [ ] **Step 1:** `listPending` GETs `/proactive/pending`; `stream` opens `new EventSource(`${base}/proactive/stream`, { withCredentials: true })`, listens for `prompt.created` / `prompt.resolved`, returns a teardown that calls `.close()`; `resolve` POSTs `/proactive/:id/resolve`. EventSource auto-reconnects natively; on the consumer side a reconnect re-runs `listPending` to backfill.
- [ ] **Step 2:** Commit: `feat(ui): HTTP proactive repository with SSE`.

### Task 10.3: Proactive context + hook

**Files:** Create `apps/ui/src/proactive/infrastructure/{proactive-context.tsx,use-proactive.ts}`, `apps/ui/src/proactive/use-cases/resolve-prompt.ts`

- [ ] **Step 1:** `proactive-context.tsx` — `'use client'`. On mount: `listPending()` to seed, then `stream()` to subscribe; upsert prompts by `id` (created → add/replace, resolved → patch status). On reconnect re-backfill. Expose `prompts: PendingPrompt[]` and `resolve(id, input)`.
- [ ] **Step 2:** `use-proactive.ts` — context hook (throws if outside provider), mirroring `use-chat.ts`.
- [ ] **Step 3:** Commit: `feat(ui): proactive context and hook`.

### Task 10.4: Proactive cards

**Files:** Create `apps/ui/src/proactive/components/{proactive-prompt-card.tsx,proactive-notice-card.tsx}`

- [ ] **Step 1:** `proactive-prompt-card.tsx` (`intent: 'confirm'`) — a `Card` with an `Eyebrow tone="ai"` ("GASTI"), body copy per spec §8 ("Vi un pago de $… a … del …. Categoría sugerida: …"), the confidence cue (≥0.7 no badge / 0.4–0.7 caption / <0.4 warn chip), and an `OptionPillStack`-style action set: **Agregar**, **Editar** (expands an inline category picker + description input + "Recordar [merchant]" checkbox), **Descartar**. On action call `useProactive().resolve(...)`; once `status !== 'pending'` lock the card with an outcome caption. Use `Num` for the amount.
- [ ] **Step 2:** `proactive-notice-card.tsx` (`intent: 'notice'`) — read-only `Card variant="lavender"`, eyebrow, the refund/chargeback copy per spec §8. No pills.
- [ ] **Step 3:** Commit: `feat(ui): proactive prompt and notice cards`.

### Task 10.5: Render proactive cards in the thread

**Files:** Modify `apps/ui/src/chat/components/conversation-thread.tsx`, `apps/ui/src/chat/components/chat-screen.tsx`, `apps/ui/app/layout.tsx`

- [ ] **Step 1:** Wrap the tree in `<ProactiveProvider>` in `layout.tsx` (alongside `ChatProvider`).
- [ ] **Step 2:** In `conversation-thread.tsx`, merge `useProactive().prompts` into the rendered list, ordered by `createdAt` against message `sentAt`, rendering `ProactivePromptCard` / `ProactiveNoticeCard` inline. Keep keys stable by prompt `id`.
- [ ] **Step 3:** In `chat-screen.tsx`, ensure proactive cards show even when the message thread is empty (a proactive card alone flips the screen out of the landing state, or renders above the hero — pick per DESIGN.md; simplest: if there are prompts, render the thread).
- [ ] **Step 4:** Verify in the browser with a hand-seeded `apps/api/data/pending-prompts.json`: cards render, **Agregar/Editar/Descartar** hit the api and lock.
- [ ] **Step 5:** Commit: `feat(ui): render proactive cards inline in the chat thread`.

---

## Phase 11 — Docs + verification

### Task 11.1: README setup section

**Files:** Modify `README.md`

- [ ] **Step 1:** Add a "Mercado Pago integration" section: env vars (both apps), `ngrok http 3001`, MP dev-panel webhook URL (`<ngrok>/mp/webhook`, topic `payments`) and redirect URI (`<ngrok>/mp/oauth/callback`), how to generate `TOKEN_ENCRYPTION_KEY`, and that the MP MCP `save_webhook` can register the tunnel.
- [ ] **Step 2:** Commit: `docs: Mercado Pago setup instructions`.

### Task 11.2: Manual verification

- [ ] **Step 1:** Walk spec §12's 13-case script end to end (connect, happy expense, Agregar, Editar+override, Descartar, happy income, refund flow, multi-tab, SSE reconnect, disconnect, webhook security, idempotency, degraded modes). Use the MP MCP tools (`save_webhook`, `create_test_user`, `add_money_test_user`, `notifications_history`).
- [ ] **Step 2:** Run `bun test` (api), `bun run build` (all), `bun run typecheck --filter=ui`.
- [ ] **Step 3:** Invoke `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`.

---

## Open items to confirm during execution (do not guess)

1. **Mastra workflow HTTP route** (Task 3.5) — the exact URL + request/response envelope the `mastra dev` server exposes for running `classify-mp-event`. Drives Task 4.4.
2. **MP webhook signature manifest** (Task 4.5) — confirm MP's current `id;request-id;ts` template via the MP MCP.
3. **MP OAuth endpoints** (Task 2.1) — confirm the authorization URL and `/oauth/token` params via the MP MCP.
4. **NestJS `@Sse()`** (Task 5.5) — confirm the decorator + `MessageEvent` shape against the installed `@nestjs/common` version.
5. **Categorization override use-case name** (Task 8.2) — find the existing merchant-override use-case in `apps/api/src/categorization` and its module export.
6. **`ExpenseCategory` vs `Category`** — this plan reuses the existing `shared/domain/category.ts` `Category` everywhere instead of the spec's separate `ExpenseCategory`. Confirm during review.
7. **Webhook signature-mismatch status** (Task 4.6) — plan returns 200 (avoids MP retry storms); spec §11 says 401. Reviewer decides.
