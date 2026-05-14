# Proactive Mercado Pago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a real Mercado Pago integration into Gasti so settled payments surface as in-chat confirmation cards (pre-classified) and reversals appear as informational notices, all within an open chat session.

**Architecture:** Three apps, clean boundaries. `apps/api` (NestJS) owns the MP webhook receiver, OAuth flow, libsql storage, and the SSE proactive stream. `apps/ai` (Mastra) hosts a single classifier `Workflow` exposed over HTTP. `apps/ui` (Next.js) renders chat cards inline in the thread and a composer chip for the MP connection state.

**Tech Stack:** Bun + Turborepo, NestJS 10, Mastra 0.10, Next.js 15, libsql (`@libsql/client` in api, `@mastra/libsql` in ai), `mercadopago` SDK, Zod, Tailwind 3, Lucide icons.

**Spec:** [docs/superpowers/specs/2026-05-14-proactive-mercadopago-design.md](../specs/2026-05-14-proactive-mercadopago-design.md)

**Testing posture:** PRODUCT.md says tests are not a deliverable. We write tests **only** for the four pieces flagged in spec Section 12: `isCompletedPayment`, `mapMpStatusToTransactionStatus`, `MpSignatureVerifier`, and `ProcessMpEvent` (orchestration with in-memory fakes). Everything else is exercised manually via the verification script in the spec.

---

## File structure (will exist at end of plan)

```
apps/api/src/
├── shared/
│   ├── db/
│   │   ├── db.module.ts
│   │   ├── libsql.client.ts                       # createClient wrapper
│   │   └── migrations/
│   │       ├── runMigrations.ts                   # idempotent runner
│   │       ├── 001_initial_schema.ts
│   │       └── 002_seed_default_user_and_tx.ts
│   └── security/
│       └── token-cipher.provider.ts               # AES-256-GCM
├── users/
│   ├── domain/{user.ts, users.repository.ts}
│   ├── repositories/libsql-users.repository.ts
│   ├── use-cases/{get-current-user.ts, link-mp-account.ts, refresh-mp-token.ts}
│   ├── providers/current-user.provider.ts
│   └── users.module.ts
├── mp/
│   ├── domain/{
│   │     mp-payment-source.ts, payment-classifier.ts, classification.ts,
│   │     is-completed-payment.ts, map-mp-status.ts
│   │   }
│   ├── providers/{
│   │     mercado-pago.provider.ts, http-payment-classifier.ts,
│   │     mp-signature-verifier.ts, mp-oauth-client.provider.ts
│   │   }
│   ├── interface/{
│   │     mp-webhook.dto.ts, mp-webhook.controller.ts, mp-oauth.controller.ts
│   │   }
│   ├── use-cases/{
│   │     process-mp-event.ts, start-mp-connect.ts, complete-mp-connect.ts
│   │   }
│   └── mp.module.ts
├── proactive/
│   ├── domain/{pending-prompt.ts, pending-prompts.repository.ts, proactive-event-bus.ts}
│   ├── repositories/libsql-pending-prompts.repository.ts
│   ├── providers/in-memory-proactive-event-bus.ts
│   ├── use-cases/{list-pending-prompts.ts, resolve-proactive-prompt.ts}
│   ├── interface/proactive.controller.ts
│   └── proactive.module.ts
├── transactions/
│   ├── domain/{transaction.ts, transactions.repository.ts}
│   ├── repositories/libsql-transactions.repository.ts
│   ├── use-cases/{add-transaction.ts, mark-transaction-reversed.ts}
│   └── transactions.module.ts
└── app.module.ts                                  # wires every feature module

apps/ai/src/mastra/
├── mp-classification/
│   ├── domain/classification.ts
│   ├── use-cases/{detect-payment-kind.ts, pick-category.ts, draft-description.ts}
│   └── workflows/classify-mp-event.ts
└── mastra/index.ts                                # registers workflow

apps/ui/
├── app/globals.css                                # add tokens per DESIGN.md
├── tailwind.config.ts                             # bridge tokens
├── public/sparkle.svg
├── components/
│   ├── icons/Sparkle.tsx
│   ├── composer/{Composer.tsx, ComposerChipRow.tsx}
│   ├── composer/chips/MercadoPagoChip.tsx
│   └── proactive/{ProactivePromptCard.tsx, ProactiveNoticeCard.tsx, index.tsx}
├── features/proactive/{useProactivePrompts.ts, useMpConnection.ts}
└── app/page.tsx                                   # rewire to render chat

apps/api/data/                                     # gitignored libsql DB
README.md                                          # ngrok + MP dev-panel setup
```

---

## Phase 0 — Project prep

Dependencies, env, design tokens, sparkle asset. No app code yet.

### Task 0.1: Install apps/api dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install packages**

```bash
bun add --filter=api @libsql/client mercadopago zod uuid
bun add --filter=api -d @types/uuid
```

- [ ] **Step 2: Confirm versions**

Run: `bun pm ls --filter=api | grep -E "libsql|mercadopago|zod|uuid"`
Expected: all four listed with versions.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json bun.lock
git commit -m "chore(api): add libsql, mercadopago, zod, uuid"
```

### Task 0.2: Install apps/ui dependencies

**Files:**
- Modify: `apps/ui/package.json`

- [ ] **Step 1: Install packages**

```bash
bun add --filter=ui lucide-react
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/package.json bun.lock
git commit -m "chore(ui): add lucide-react"
```

### Task 0.3: Install apps/ai dependencies

**Files:**
- Modify: `apps/ai/package.json`

- [ ] **Step 1: Install packages**

```bash
bun add --filter=ai @mastra/libsql zod
```

- [ ] **Step 2: Commit**

```bash
git add apps/ai/package.json bun.lock
git commit -m "chore(ai): add @mastra/libsql, zod"
```

### Task 0.4: Env files

**Files:**
- Create: `apps/api/.env.example`
- Create: `apps/ai/.env.example`

- [ ] **Step 1: Create `apps/api/.env.example`**

```
# Mercado Pago application credentials
MP_CLIENT_ID=
MP_CLIENT_SECRET=
MP_WEBHOOK_SECRET=
MP_REDIRECT_URI=http://localhost:3001/mp/oauth/callback

# AES-256-GCM key for at-rest token encryption (32 bytes base64)
# Generate with: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=

# Where the libsql file lives
DB_PATH=apps/api/data/gasti.db

# Where apps/ai is reachable (classifier endpoint)
AI_BASE_URL=http://localhost:4111

# Optional UI origin for CORS
UI_ORIGIN=http://localhost:3000
```

- [ ] **Step 2: Create `apps/ai/.env.example`**

```
OPENAI_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/.env.example apps/ai/.env.example
git commit -m "chore: add env examples for proactive MP feature"
```

### Task 0.5: Gitignore `apps/api/data/`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append to `.gitignore`**

```
# Runtime libsql DB
apps/api/data/*.db
apps/api/data/*.db-*
```

- [ ] **Step 2: Create `apps/api/data/.gitkeep`**

Run: `mkdir -p apps/api/data && touch apps/api/data/.gitkeep`

- [ ] **Step 3: Commit**

```bash
git add .gitignore apps/api/data/.gitkeep
git commit -m "chore: ignore runtime libsql DB"
```

### Task 0.6: Tailwind tokens (from DESIGN.md)

**Files:**
- Modify: `apps/ui/app/globals.css`
- Modify: `apps/ui/tailwind.config.ts`

- [ ] **Step 1: Replace contents of `apps/ui/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&family=Instrument+Serif:ital@1&display=swap');

:root {
  /* Mesh */
  --mesh-peach: #FFB088; --mesh-sunset: #FF7A5C; --mesh-rose: #F4A5C8;
  --mesh-lilac: #B69CFF; --mesh-azure: #6A8BFF; --mesh-indigo: #5B4FCF;
  --mesh-ambient:
    radial-gradient(60% 55% at 12% 18%, #FFB088 0%, rgba(255,176,136,0) 60%),
    radial-gradient(55% 50% at 92% 12%, #FF7A5C 0%, rgba(255,122,92,0) 62%),
    radial-gradient(70% 60% at 18% 92%, #6A8BFF 0%, rgba(106,139,255,0) 65%),
    radial-gradient(70% 70% at 88% 88%, #B69CFF 0%, rgba(182,156,255,0) 65%),
    linear-gradient(135deg, #F4A5C8 0%, #B69CFF 50%, #6A8BFF 100%);

  /* Brand */
  --brand-indigo: #4F46E5; --brand-indigo-deep: #3B30C9; --brand-indigo-soft: #EEEBFF;
  --ai-violet: #7C6BFF; --ai-violet-soft: #F1EEFF; --ai-violet-ink: #524ABF;
  --brand-grad: linear-gradient(180deg, #6E61FF 0%, #4338CA 100%);
  --brand-glow: 0 10px 30px -10px rgba(79,70,229,0.55), inset 0 1px 0 rgba(255,255,255,0.25);

  /* Surfaces */
  --surface-0: #FFFFFF; --surface-1: #FAFAFE; --surface-2: #F4F3FA;
  --surface-3: #ECEAF6; --surface-tint: #F7F4FF;
  --surface-frost: rgba(255,255,255,0.62); --surface-frost-2: rgba(255,255,255,0.42);

  /* Ink */
  --ink-1: #0F0E17; --ink-2: #3A3849; --ink-3: #6E6B82; --ink-4: #A09DB4;
  --ink-on-mesh: #FFFFFF; --ink-on-mesh-mute: rgba(255,255,255,0.78);

  /* Lines */
  --line-1: rgba(15,14,23,0.06); --line-2: rgba(15,14,23,0.10);
  --line-mesh: rgba(255,255,255,0.35); --line-inner: rgba(255,255,255,0.6);

  /* Semantic */
  --pos: #1FA971; --pos-soft: #E6F7EF;
  --neg: #E64545; --neg-soft: #FCEBEB;
  --warn: #E5A03A; --warn-soft: #FBF1DF;
  --info: #3E6DF0; --info-soft: #E8EEFE;

  /* Radii */
  --r-xs: 6px; --r-sm: 10px; --r-md: 14px; --r-lg: 20px;
  --r-xl: 28px; --r-2xl: 36px; --r-pill: 999px;

  /* Elevation */
  --e-1: 0 1px 2px rgba(15,14,23,0.04), 0 1px 1px rgba(15,14,23,0.03);
  --e-2: 0 4px 14px -6px rgba(15,14,23,0.10), 0 2px 4px rgba(15,14,23,0.04);
  --e-3: 0 16px 40px -16px rgba(15,14,23,0.18), 0 4px 12px rgba(15,14,23,0.05);
  --e-4: 0 30px 80px -28px rgba(48,42,120,0.32), 0 8px 24px rgba(15,14,23,0.06);
  --e-glow-ai: 0 12px 36px -12px rgba(124,107,255,0.45);

  /* Blur */
  --blur-1: blur(8px) saturate(120%);
  --blur-2: blur(18px) saturate(140%);
  --blur-3: blur(32px) saturate(160%);

  /* Motion */
  --dur-fast: 140ms; --dur-base: 260ms; --dur-slow: 480ms; --dur-ambient: 1200ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.83, 0, 0.17, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

html, body {
  background: var(--surface-1);
  color: var(--ink-1);
  font-family: 'Geist', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
}

.bg-mesh { background: var(--mesh-ambient); }
.font-mono { font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace; font-feature-settings: 'tnum' 1, 'lnum' 1; }
::selection { background: var(--ai-violet-soft); color: var(--ai-violet-ink); }
```

- [ ] **Step 2: Replace `apps/ui/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)', 1: 'var(--surface-1)', 2: 'var(--surface-2)',
          3: 'var(--surface-3)', tint: 'var(--surface-tint)',
          frost: 'var(--surface-frost)', frost2: 'var(--surface-frost-2)',
        },
        ink: { 1: 'var(--ink-1)', 2: 'var(--ink-2)', 3: 'var(--ink-3)', 4: 'var(--ink-4)' },
        brand: { indigo: 'var(--brand-indigo)', soft: 'var(--brand-indigo-soft)' },
        ai: { violet: 'var(--ai-violet)', soft: 'var(--ai-violet-soft)', ink: 'var(--ai-violet-ink)' },
        line: { 1: 'var(--line-1)', 2: 'var(--line-2)' },
        pos: { DEFAULT: 'var(--pos)', soft: 'var(--pos-soft)' },
        neg: { DEFAULT: 'var(--neg)', soft: 'var(--neg-soft)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)' },
      },
      borderRadius: {
        xs: 'var(--r-xs)', sm: 'var(--r-sm)', md: 'var(--r-md)',
        lg: 'var(--r-lg)', xl: 'var(--r-xl)', '2xl': 'var(--r-2xl)', pill: 'var(--r-pill)',
      },
      boxShadow: {
        e1: 'var(--e-1)', e2: 'var(--e-2)', e3: 'var(--e-3)', e4: 'var(--e-4)',
        ai: 'var(--e-glow-ai)', brand: 'var(--brand-glow)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/globals.css apps/ui/tailwind.config.ts
git commit -m "feat(ui): wire DESIGN.md tokens into Tailwind"
```

### Task 0.7: Sparkle asset + component

**Files:**
- Create: `apps/ui/public/sparkle.svg`
- Create: `apps/ui/components/icons/Sparkle.tsx`

- [ ] **Step 1: Create `apps/ui/public/sparkle.svg`**

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor">
  <path d="M32 4 C 33 18, 34 22, 38 26 C 42 30, 46 31, 60 32 C 46 33, 42 34, 38 38 C 34 42, 33 46, 32 60 C 31 46, 30 42, 26 38 C 22 34, 18 33, 4 32 C 18 31, 22 30, 26 26 C 30 22, 31 18, 32 4 Z"/>
</svg>
```

- [ ] **Step 2: Create `apps/ui/components/icons/Sparkle.tsx`**

```tsx
type Props = { size?: number; className?: string };

export function Sparkle({ size = 14, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M32 4 C 33 18, 34 22, 38 26 C 42 30, 46 31, 60 32 C 46 33, 42 34, 38 38 C 34 42, 33 46, 32 60 C 31 46, 30 42, 26 38 C 22 34, 18 33, 4 32 C 18 31, 22 30, 26 26 C 30 22, 31 18, 32 4 Z"/>
    </svg>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ui/public/sparkle.svg apps/ui/components/icons/Sparkle.tsx
git commit -m "feat(ui): add sparkle asset and component"
```

---

## Phase 1 — apps/api foundation: libsql + encryption + users

Build the storage layer and the encrypted single-user singleton before anything MP-touching.

### Task 1.1: TokenCipher provider (AES-256-GCM)

**Files:**
- Create: `apps/api/src/shared/security/token-cipher.provider.ts`
- Test: `apps/api/src/shared/security/token-cipher.provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/shared/security/token-cipher.provider.test.ts
import { describe, it, expect } from 'bun:test';
import { TokenCipher } from './token-cipher.provider';

const key = Buffer.alloc(32).fill(7).toString('base64');

describe('TokenCipher', () => {
  it('round-trips plaintext', () => {
    const cipher = new TokenCipher(key);
    const enc = cipher.encrypt('hello world');
    expect(enc.ciphertext).toBeInstanceOf(Buffer);
    expect(enc.iv.length).toBe(12);
    expect(enc.tag.length).toBe(16);
    expect(cipher.decrypt(enc)).toBe('hello world');
  });

  it('produces different IV each call', () => {
    const cipher = new TokenCipher(key);
    const a = cipher.encrypt('x');
    const b = cipher.encrypt('x');
    expect(Buffer.compare(a.iv, b.iv)).not.toBe(0);
  });

  it('throws on tampered ciphertext', () => {
    const cipher = new TokenCipher(key);
    const enc = cipher.encrypt('secret');
    enc.ciphertext[0] ^= 0xff;
    expect(() => cipher.decrypt(enc)).toThrow();
  });

  it('rejects bad key length', () => {
    expect(() => new TokenCipher('aaaa')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/api/src/shared/security/token-cipher.provider.test.ts`
Expected: FAIL with module-not-found for `./token-cipher.provider`.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/shared/security/token-cipher.provider.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export type EncryptedBlob = { ciphertext: Buffer; iv: Buffer; tag: Buffer };

@Injectable()
export class TokenCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
    this.key = key;
  }

  encrypt(plaintext: string): EncryptedBlob {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
    const tag = c.getAuthTag();
    return { ciphertext, iv, tag };
  }

  decrypt(blob: EncryptedBlob): string {
    const d = createDecipheriv('aes-256-gcm', this.key, blob.iv);
    d.setAuthTag(blob.tag);
    return Buffer.concat([d.update(blob.ciphertext), d.final()]).toString('utf8');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/api/src/shared/security/token-cipher.provider.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/security/
git commit -m "feat(api): AES-256-GCM token cipher"
```

### Task 1.2: libsql client wrapper + db module

**Files:**
- Create: `apps/api/src/shared/db/libsql.client.ts`
- Create: `apps/api/src/shared/db/db.module.ts`

- [ ] **Step 1: Create `libsql.client.ts`**

```ts
// apps/api/src/shared/db/libsql.client.ts
import { createClient, Client } from '@libsql/client';

export type Db = Client;

export function makeLibsqlClient(dbPath: string): Db {
  const url = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;
  return createClient({ url });
}
```

- [ ] **Step 2: Create `db.module.ts`**

```ts
// apps/api/src/shared/db/db.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { makeLibsqlClient, Db } from './libsql.client';
import { runMigrations } from './migrations/runMigrations';

export const DB = Symbol('DB');

@Global()
@Module({
  providers: [{
    provide: DB,
    inject: [ConfigService],
    useFactory: async (cfg: ConfigService): Promise<Db> => {
      const path = cfg.get<string>('DB_PATH') ?? 'apps/api/data/gasti.db';
      const db = makeLibsqlClient(path);
      await runMigrations(db);
      return db;
    },
  }],
  exports: [DB],
})
export class DbModule {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/db/
git commit -m "feat(api): libsql client wrapper + db module skeleton"
```

### Task 1.3: Migration runner + initial schema

**Files:**
- Create: `apps/api/src/shared/db/migrations/runMigrations.ts`
- Create: `apps/api/src/shared/db/migrations/001_initial_schema.ts`

- [ ] **Step 1: Create `runMigrations.ts`**

```ts
// apps/api/src/shared/db/migrations/runMigrations.ts
import type { Db } from '../libsql.client';
import { migration001 } from './001_initial_schema';

const MIGRATIONS = [migration001];

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(`
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );
  `);

  const applied = await db.execute('select version from schema_migrations');
  const appliedVersions = new Set(applied.rows.map((r: any) => Number(r.version)));

  for (const m of MIGRATIONS) {
    if (appliedVersions.has(m.version)) continue;
    await db.batch(m.statements.concat([
      {
        sql: 'insert into schema_migrations (version, applied_at) values (?, ?)',
        args: [m.version, new Date().toISOString()],
      },
    ]), 'write');
  }
}
```

- [ ] **Step 2: Create `001_initial_schema.ts`**

```ts
// apps/api/src/shared/db/migrations/001_initial_schema.ts
export const migration001 = {
  version: 1,
  statements: [
    `create table if not exists users (
       id                       text primary key,
       display_name             text,
       language_pref            text,
       mp_user_id               text unique,
       mp_access_token_enc      blob,
       mp_access_token_iv       blob,
       mp_access_token_tag      blob,
       mp_refresh_token_enc     blob,
       mp_refresh_token_iv      blob,
       mp_refresh_token_tag     blob,
       mp_token_expires_at      text,
       mp_scope                 text,
       mp_live_mode             integer,
       mp_connected_at          text,
       created_at               text not null
     );`,
    `create table if not exists transactions (
       id                  text primary key,
       user_id             text not null references users(id),
       date                text not null,
       amount              real not null,
       currency            text not null default 'ARS',
       category            text not null,
       description         text not null,
       merchant            text not null,
       direction           text not null default 'expense'
                              check (direction in ('expense','income')),
       status              text not null default 'active'
                              check (status in ('active','refunded','charged_back')),
       status_changed_at   text,
       source              text not null default 'manual'
                              check (source in ('manual','mp_webhook')),
       mp_payment_id       text
     );`,
    `create unique index if not exists idx_tx_mp_payment_id
       on transactions(user_id, mp_payment_id) where mp_payment_id is not null;`,
    `create table if not exists pending_prompts (
       id                       text primary key,
       user_id                  text not null references users(id),
       mp_payment_id            text not null,
       kind                     text not null check (kind in ('income','expense')),
       amount                   real not null,
       merchant                 text,
       payment_date             text not null,
       suggested_category       text not null,
       suggested_description    text not null,
       confidence               real not null,
       intent                   text not null check (intent in ('confirm','notice')),
       notice_reason            text check (notice_reason in ('mp_refund','mp_chargeback') or notice_reason is null),
       status                   text not null check (status in ('pending','added','discarded','auto')),
       resolved_transaction_id  text,
       created_at               text not null,
       resolved_at              text
     );`,
    `create unique index if not exists idx_pending_mp_payment
       on pending_prompts (user_id, mp_payment_id);`,
    `create index if not exists idx_pending_status
       on pending_prompts (user_id, status, created_at);`,
  ].map((sql) => ({ sql, args: [] as any[] })),
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/db/migrations/
git commit -m "feat(api): initial libsql schema migration"
```

### Task 1.4: Seed migration (default user + transactions.json)

**Files:**
- Create: `apps/api/src/shared/db/migrations/002_seed.ts`
- Modify: `apps/api/src/shared/db/migrations/runMigrations.ts`

- [ ] **Step 1: Create `002_seed.ts`**

```ts
// apps/api/src/shared/db/migrations/002_seed.ts
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Db } from '../libsql.client';

type SeedRow = {
  id?: string; date: string; amount: number; currency?: string;
  category: string; description: string; merchant: string;
};

export const migration002 = {
  version: 2,
  custom: async (db: Db) => {
    // Ensure singleton user
    const u = await db.execute({
      sql: 'select id from users where id = ?',
      args: ['default-user'],
    });
    if (u.rows.length === 0) {
      await db.execute({
        sql: 'insert into users (id, created_at) values (?, ?)',
        args: ['default-user', new Date().toISOString()],
      });
    }

    // Hydrate transactions if empty
    const t = await db.execute('select count(*) as n from transactions');
    const n = Number((t.rows[0] as any).n);
    if (n === 0) {
      const path = 'data/transactions.json';
      let raw: string;
      try { raw = await readFile(path, 'utf8'); } catch { return; }
      const seed: SeedRow[] = JSON.parse(raw);
      const stmts = seed.map((r) => ({
        sql: `insert into transactions
              (id, user_id, date, amount, currency, category, description, merchant,
               direction, status, source, mp_payment_id)
              values (?, ?, ?, ?, ?, ?, ?, ?, 'expense', 'active', 'manual', null)`,
        args: [
          r.id ?? randomUUID(), 'default-user', r.date, r.amount,
          r.currency ?? 'ARS', r.category, r.description, r.merchant,
        ],
      }));
      if (stmts.length > 0) await db.batch(stmts, 'write');
    }
  },
};
```

- [ ] **Step 2: Modify `runMigrations.ts` to support custom seed migrations**

```ts
// apps/api/src/shared/db/migrations/runMigrations.ts
import type { Db } from '../libsql.client';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_seed';

type StatementMigration = { version: number; statements: { sql: string; args: any[] }[] };
type CustomMigration = { version: number; custom: (db: Db) => Promise<void> };
type Migration = StatementMigration | CustomMigration;

const MIGRATIONS: Migration[] = [migration001, migration002];

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(`
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );
  `);

  const applied = await db.execute('select version from schema_migrations');
  const appliedVersions = new Set(applied.rows.map((r: any) => Number(r.version)));

  for (const m of MIGRATIONS) {
    if (appliedVersions.has(m.version)) continue;
    if ('statements' in m) {
      await db.batch(
        m.statements.concat([{
          sql: 'insert into schema_migrations (version, applied_at) values (?, ?)',
          args: [m.version, new Date().toISOString()],
        }]),
        'write',
      );
    } else {
      await m.custom(db);
      await db.execute({
        sql: 'insert into schema_migrations (version, applied_at) values (?, ?)',
        args: [m.version, new Date().toISOString()],
      });
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/db/migrations/
git commit -m "feat(api): seed default user and transactions.json"
```

### Task 1.5: User domain + UsersRepository interface

**Files:**
- Create: `apps/api/src/users/domain/user.ts`
- Create: `apps/api/src/users/domain/users.repository.ts`

- [ ] **Step 1: Create `user.ts`**

```ts
// apps/api/src/users/domain/user.ts
export type LanguageHint = 'es' | 'en' | null;

export interface User {
  readonly id: string;
  readonly displayName: string | null;
  readonly languagePref: LanguageHint;
  readonly mpUserId: string | null;
  readonly mpAccessToken: string | null;
  readonly mpRefreshToken: string | null;
  readonly mpTokenExpiresAt: Date | null;
  readonly mpScope: string | null;
  readonly mpLiveMode: boolean | null;
  readonly mpConnectedAt: Date | null;
  readonly createdAt: Date;
}

export const isMpConnected = (u: User): boolean => u.mpUserId !== null;

export const isMpTokenExpired = (u: User, skewMs = 5 * 60_000): boolean =>
  u.mpTokenExpiresAt !== null
  && u.mpTokenExpiresAt.getTime() - skewMs < Date.now();
```

- [ ] **Step 2: Create `users.repository.ts`**

```ts
// apps/api/src/users/domain/users.repository.ts
import type { User } from './user';

export type MpLinkFields = Pick<User,
  'mpUserId' | 'mpAccessToken' | 'mpRefreshToken'
  | 'mpTokenExpiresAt' | 'mpScope' | 'mpLiveMode' | 'mpConnectedAt'
>;

export type MpRefreshFields = Pick<User,
  'mpAccessToken' | 'mpRefreshToken' | 'mpTokenExpiresAt'
>;

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  getCurrent(): Promise<User>;
  findByMpUserId(mpUserId: string): Promise<User | null>;
  linkMpAccount(userId: string, mp: MpLinkFields): Promise<void>;
  updateMpTokens(userId: string, fields: MpRefreshFields): Promise<void>;
  unlinkMpAccount(userId: string): Promise<void>;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/users/domain/
git commit -m "feat(api): user entity and UsersRepository contract"
```

### Task 1.6: LibsqlUsersRepository

**Files:**
- Create: `apps/api/src/users/repositories/libsql-users.repository.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/users/repositories/libsql-users.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../../shared/db/db.module';
import type { Db } from '../../shared/db/libsql.client';
import { TokenCipher } from '../../shared/security/token-cipher.provider';
import type {
  UsersRepository, MpLinkFields, MpRefreshFields,
} from '../domain/users.repository';
import type { User } from '../domain/user';

@Injectable()
export class LibsqlUsersRepository implements UsersRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cipher: TokenCipher,
  ) {}

  async getCurrent(): Promise<User> {
    const res = await this.db.execute({
      sql: 'select * from users where id = ?', args: ['default-user'],
    });
    if (res.rows.length === 0) throw new Error('default-user not seeded');
    return this.rowToUser(res.rows[0] as any);
  }

  async findByMpUserId(mpUserId: string): Promise<User | null> {
    const res = await this.db.execute({
      sql: 'select * from users where mp_user_id = ?', args: [mpUserId],
    });
    return res.rows.length ? this.rowToUser(res.rows[0] as any) : null;
  }

  async linkMpAccount(userId: string, mp: MpLinkFields): Promise<void> {
    const access = this.cipher.encrypt(mp.mpAccessToken!);
    const refresh = this.cipher.encrypt(mp.mpRefreshToken!);
    await this.db.execute({
      sql: `update users set
              mp_user_id = ?,
              mp_access_token_enc = ?, mp_access_token_iv = ?, mp_access_token_tag = ?,
              mp_refresh_token_enc = ?, mp_refresh_token_iv = ?, mp_refresh_token_tag = ?,
              mp_token_expires_at = ?, mp_scope = ?, mp_live_mode = ?, mp_connected_at = ?
            where id = ?`,
      args: [
        mp.mpUserId,
        access.ciphertext, access.iv, access.tag,
        refresh.ciphertext, refresh.iv, refresh.tag,
        mp.mpTokenExpiresAt!.toISOString(), mp.mpScope, mp.mpLiveMode ? 1 : 0,
        mp.mpConnectedAt!.toISOString(),
        userId,
      ],
    });
  }

  async updateMpTokens(userId: string, fields: MpRefreshFields): Promise<void> {
    const access = this.cipher.encrypt(fields.mpAccessToken!);
    const refresh = this.cipher.encrypt(fields.mpRefreshToken!);
    await this.db.execute({
      sql: `update users set
              mp_access_token_enc = ?, mp_access_token_iv = ?, mp_access_token_tag = ?,
              mp_refresh_token_enc = ?, mp_refresh_token_iv = ?, mp_refresh_token_tag = ?,
              mp_token_expires_at = ?
            where id = ?`,
      args: [
        access.ciphertext, access.iv, access.tag,
        refresh.ciphertext, refresh.iv, refresh.tag,
        fields.mpTokenExpiresAt!.toISOString(),
        userId,
      ],
    });
  }

  async unlinkMpAccount(userId: string): Promise<void> {
    await this.db.execute({
      sql: `update users set
              mp_user_id = null,
              mp_access_token_enc = null, mp_access_token_iv = null, mp_access_token_tag = null,
              mp_refresh_token_enc = null, mp_refresh_token_iv = null, mp_refresh_token_tag = null,
              mp_token_expires_at = null, mp_scope = null,
              mp_live_mode = null, mp_connected_at = null
            where id = ?`,
      args: [userId],
    });
  }

  private rowToUser(row: any): User {
    const hasTokens = row.mp_access_token_enc !== null;
    const access = hasTokens
      ? this.cipher.decrypt({
          ciphertext: row.mp_access_token_enc,
          iv: row.mp_access_token_iv,
          tag: row.mp_access_token_tag,
        })
      : null;
    const refresh = hasTokens
      ? this.cipher.decrypt({
          ciphertext: row.mp_refresh_token_enc,
          iv: row.mp_refresh_token_iv,
          tag: row.mp_refresh_token_tag,
        })
      : null;
    return {
      id: row.id,
      displayName: row.display_name,
      languagePref: row.language_pref,
      mpUserId: row.mp_user_id,
      mpAccessToken: access,
      mpRefreshToken: refresh,
      mpTokenExpiresAt: row.mp_token_expires_at ? new Date(row.mp_token_expires_at) : null,
      mpScope: row.mp_scope,
      mpLiveMode: row.mp_live_mode === null ? null : row.mp_live_mode === 1,
      mpConnectedAt: row.mp_connected_at ? new Date(row.mp_connected_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/users/repositories/
git commit -m "feat(api): libsql users repository with token encryption"
```

### Task 1.7: CurrentUserProvider + GetCurrentUser use-case

**Files:**
- Create: `apps/api/src/users/providers/current-user.provider.ts`
- Create: `apps/api/src/users/use-cases/get-current-user.ts`

- [ ] **Step 1: Create provider**

```ts
// apps/api/src/users/providers/current-user.provider.ts
import { Inject, Injectable } from '@nestjs/common';
import { USERS_REPOSITORY, UsersRepository } from '../domain/users.repository';
import type { User } from '../domain/user';

@Injectable()
export class CurrentUserProvider {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}
  async get(): Promise<User> { return this.users.getCurrent(); }
}
```

- [ ] **Step 2: Create use-case**

```ts
// apps/api/src/users/use-cases/get-current-user.ts
import { Injectable } from '@nestjs/common';
import { CurrentUserProvider } from '../providers/current-user.provider';
import type { User } from '../domain/user';

@Injectable()
export class GetCurrentUser {
  constructor(private readonly current: CurrentUserProvider) {}
  async execute(): Promise<User> { return this.current.get(); }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/users/providers/ apps/api/src/users/use-cases/
git commit -m "feat(api): CurrentUserProvider and GetCurrentUser use-case"
```

### Task 1.8: Users module

**Files:**
- Create: `apps/api/src/users/users.module.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/users/users.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenCipher } from '../shared/security/token-cipher.provider';
import { USERS_REPOSITORY } from './domain/users.repository';
import { LibsqlUsersRepository } from './repositories/libsql-users.repository';
import { CurrentUserProvider } from './providers/current-user.provider';
import { GetCurrentUser } from './use-cases/get-current-user';

@Module({
  providers: [
    {
      provide: TokenCipher,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const key = cfg.getOrThrow<string>('TOKEN_ENCRYPTION_KEY');
        return new TokenCipher(key);
      },
    },
    { provide: USERS_REPOSITORY, useClass: LibsqlUsersRepository },
    CurrentUserProvider,
    GetCurrentUser,
  ],
  exports: [TokenCipher, USERS_REPOSITORY, CurrentUserProvider, GetCurrentUser],
})
export class UsersModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/users/users.module.ts
git commit -m "feat(api): users module wiring"
```

### Task 1.9: Bootstrap config + app module

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Install ConfigModule**

```bash
bun add --filter=api @nestjs/config
```

- [ ] **Step 2: Update `app.module.ts`**

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './shared/db/db.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/api/.env' }),
    DbModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 3: Update `main.ts` for graceful boot + CORS**

```ts
// apps/api/src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableCors({
    origin: process.env.UI_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`api listening on http://localhost:${port}`);
}

bootstrap();
```

- [ ] **Step 4: Verify boot**

Run: `bun dev --filter=api`
Expected: log "api listening on http://localhost:3001"; `curl http://localhost:3001/health` returns `{"ok":true}`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json bun.lock apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(api): bootstrap with ConfigModule + DB + Users + CORS"
```

---

## Phase 2 — apps/api: MP OAuth flow

End-to-end OAuth Connect from chip click → MP authorize → callback → token persistence.

### Task 2.1: MP OAuth client wrapper

**Files:**
- Create: `apps/api/src/mp/providers/mp-oauth-client.provider.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/mp/providers/mp-oauth-client.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, OAuth } from 'mercadopago';
import { z } from 'zod';

const TokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string(),
  user_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  refresh_token: z.string(),
  public_key: z.string().optional(),
  live_mode: z.boolean().optional(),
});

export type MpTokenSet = z.infer<typeof TokenSchema>;

@Injectable()
export class MpOAuthClient {
  private readonly oauth: OAuth;
  constructor(private readonly cfg: ConfigService) {
    const cfgClient = new MercadoPagoConfig({
      accessToken: this.cfg.getOrThrow('MP_CLIENT_SECRET'),
    });
    this.oauth = new OAuth(cfgClient);
  }

  authorizationUrl(state: string): string {
    const clientId = this.cfg.getOrThrow('MP_CLIENT_ID');
    const redirect = this.cfg.getOrThrow('MP_REDIRECT_URI');
    const u = new URL('https://auth.mercadopago.com/authorization');
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('platform_id', 'mp');
    u.searchParams.set('state', state);
    u.searchParams.set('redirect_uri', redirect);
    return u.toString();
  }

  async exchangeCode(code: string): Promise<MpTokenSet> {
    const res = await this.oauth.create({
      body: {
        client_id: this.cfg.getOrThrow('MP_CLIENT_ID'),
        client_secret: this.cfg.getOrThrow('MP_CLIENT_SECRET'),
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.cfg.getOrThrow('MP_REDIRECT_URI'),
      } as any,
    });
    return TokenSchema.parse(res);
  }

  async refresh(refreshToken: string): Promise<MpTokenSet> {
    const res = await this.oauth.create({
      body: {
        client_id: this.cfg.getOrThrow('MP_CLIENT_ID'),
        client_secret: this.cfg.getOrThrow('MP_CLIENT_SECRET'),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      } as any,
    });
    return TokenSchema.parse(res);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/mp/providers/mp-oauth-client.provider.ts
git commit -m "feat(api): MP OAuth client wrapping mercadopago SDK"
```

### Task 2.2: Start + Complete MP Connect use-cases

**Files:**
- Create: `apps/api/src/mp/use-cases/start-mp-connect.ts`
- Create: `apps/api/src/mp/use-cases/complete-mp-connect.ts`

- [ ] **Step 1: Create `start-mp-connect.ts`**

```ts
// apps/api/src/mp/use-cases/start-mp-connect.ts
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { MpOAuthClient } from '../providers/mp-oauth-client.provider';

@Injectable()
export class StartMpConnect {
  constructor(private readonly oauth: MpOAuthClient) {}

  execute(): { url: string; state: string } {
    const state = randomBytes(16).toString('hex');
    const url = this.oauth.authorizationUrl(state);
    return { url, state };
  }
}
```

- [ ] **Step 2: Create `complete-mp-connect.ts`**

```ts
// apps/api/src/mp/use-cases/complete-mp-connect.ts
import { Inject, Injectable } from '@nestjs/common';
import { MpOAuthClient } from '../providers/mp-oauth-client.provider';
import { USERS_REPOSITORY, UsersRepository } from '../../users/domain/users.repository';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';

@Injectable()
export class CompleteMpConnect {
  constructor(
    private readonly oauth: MpOAuthClient,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly current: CurrentUserProvider,
  ) {}

  async execute(code: string): Promise<void> {
    const tokens = await this.oauth.exchangeCode(code);
    const user = await this.current.get();
    await this.users.linkMpAccount(user.id, {
      mpUserId: tokens.user_id,
      mpAccessToken: tokens.access_token,
      mpRefreshToken: tokens.refresh_token,
      mpTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      mpScope: tokens.scope,
      mpLiveMode: tokens.live_mode ?? false,
      mpConnectedAt: new Date(),
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mp/use-cases/
git commit -m "feat(api): start+complete MP connect use-cases"
```

### Task 2.3: RefreshMpToken use-case

**Files:**
- Create: `apps/api/src/users/use-cases/refresh-mp-token.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/users/use-cases/refresh-mp-token.ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { MpOAuthClient } from '../../mp/providers/mp-oauth-client.provider';
import { USERS_REPOSITORY, UsersRepository } from '../domain/users.repository';

export class MpReauthRequiredError extends Error {
  constructor() { super('MP_REAUTH_REQUIRED'); }
}

@Injectable()
export class RefreshMpToken {
  constructor(
    private readonly oauth: MpOAuthClient,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  async execute(userId: string, refreshToken: string): Promise<string> {
    try {
      const tokens = await this.oauth.refresh(refreshToken);
      await this.users.updateMpTokens(userId, {
        mpAccessToken: tokens.access_token,
        mpRefreshToken: tokens.refresh_token,
        mpTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      });
      return tokens.access_token;
    } catch (e: any) {
      if (this.isRefreshExpired(e)) {
        await this.users.unlinkMpAccount(userId);
        throw new MpReauthRequiredError();
      }
      throw e;
    }
  }

  private isRefreshExpired(e: any): boolean {
    const msg = String(e?.message ?? '').toLowerCase();
    return msg.includes('invalid_grant') || msg.includes('refresh');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/users/use-cases/refresh-mp-token.ts
git commit -m "feat(api): refresh MP token use-case"
```

### Task 2.4: MP OAuth controller

**Files:**
- Create: `apps/api/src/mp/interface/mp-oauth.controller.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/mp/interface/mp-oauth.controller.ts
import {
  BadRequestException, Controller, Get, Inject, Post, Query, Res, Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StartMpConnect } from '../use-cases/start-mp-connect';
import { CompleteMpConnect } from '../use-cases/complete-mp-connect';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';
import { USERS_REPOSITORY, UsersRepository } from '../../users/domain/users.repository';

const STATE_COOKIE = 'mp_oauth_state';

@Controller('mp/oauth')
export class MpOAuthController {
  constructor(
    private readonly start: StartMpConnect,
    private readonly complete: CompleteMpConnect,
    private readonly current: CurrentUserProvider,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  @Get('start')
  startConnect(@Res() res: Response) {
    const { url, state } = this.start.execute();
    res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 600_000 });
    res.redirect(302, url);
  }

  @Get('callback')
  async callback(
    @Req() req: Request, @Res() res: Response,
    @Query('code') code?: string, @Query('state') state?: string,
  ) {
    const cookieState = req.cookies?.[STATE_COOKIE];
    if (!code || !state || !cookieState || state !== cookieState) {
      throw new BadRequestException('invalid_state');
    }
    res.clearCookie(STATE_COOKIE);
    await this.complete.execute(code);
    const uiOrigin = process.env.UI_ORIGIN ?? 'http://localhost:3000';
    res.redirect(302, uiOrigin + '/');
  }

  @Post('disconnect')
  async disconnect() {
    const user = await this.current.get();
    await this.users.unlinkMpAccount(user.id);
    return { ok: true };
  }

  @Get('status')
  async status() {
    const user = await this.current.get();
    if (!user.mpUserId) return { connected: false };
    return {
      connected: true,
      mpUserIdLast4: user.mpUserId.slice(-4),
      connectedAt: user.mpConnectedAt?.toISOString(),
      liveMode: user.mpLiveMode ?? false,
    };
  }
}
```

- [ ] **Step 2: Install cookie-parser**

```bash
bun add --filter=api cookie-parser
bun add --filter=api -d @types/cookie-parser
```

- [ ] **Step 3: Wire cookie-parser in `apps/api/src/main.ts`**

Replace the `bootstrap()` function body's CORS line with these three lines:

```ts
  app.use((await import('cookie-parser')).default());
  app.enableCors({
    origin: process.env.UI_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mp/interface/mp-oauth.controller.ts apps/api/src/main.ts apps/api/package.json bun.lock
git commit -m "feat(api): MP OAuth controller (start, callback, disconnect, status)"
```

### Task 2.5: MP module (partial — OAuth only)

**Files:**
- Create: `apps/api/src/mp/mp.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create `mp.module.ts`**

```ts
// apps/api/src/mp/mp.module.ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MpOAuthClient } from './providers/mp-oauth-client.provider';
import { StartMpConnect } from './use-cases/start-mp-connect';
import { CompleteMpConnect } from './use-cases/complete-mp-connect';
import { RefreshMpToken } from '../users/use-cases/refresh-mp-token';
import { MpOAuthController } from './interface/mp-oauth.controller';

@Module({
  imports: [UsersModule],
  controllers: [MpOAuthController],
  providers: [MpOAuthClient, StartMpConnect, CompleteMpConnect, RefreshMpToken],
  exports: [MpOAuthClient, RefreshMpToken],
})
export class MpModule {}
```

- [ ] **Step 2: Register in `app.module.ts`**

Add to `imports`: `MpModule`.

- [ ] **Step 3: Boot test**

Run: `bun dev --filter=api`. Open `http://localhost:3001/mp/oauth/status` → `{"connected":false}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mp/mp.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): MP module wiring (oauth-only stage)"
```

---

## Phase 3 — apps/ai: classifier workflow

A single Mastra `Workflow` exposed over HTTP that turns a raw MP payment into a Classification.

> **Before starting Phase 3:** consult the Mastra MCP (`@mastra/mcp-docs-server` in `.mcp.json`) for the current `Workflow` and `createStep` syntax in the installed Mastra version. The code below targets `@mastra/core ^0.10`. If the API differs in your version, adjust the syntax — never invent a Mastra API from memory. The shape (3 steps: kind-aware category + description) is what matters.

### Task 3.1: Classification domain in apps/ai

**Files:**
- Create: `apps/ai/src/mastra/mp-classification/domain/classification.ts`

- [ ] **Step 1: Implement**

```ts
// apps/ai/src/mastra/mp-classification/domain/classification.ts
import { z } from 'zod';

export const CategoryEnum = z.enum([
  'comida', 'transporte', 'entretenimiento', 'salud',
  'servicios', 'educacion', 'otros',
]);
export type ExpenseCategory = z.infer<typeof CategoryEnum>;

export const PaymentKindEnum = z.enum(['income', 'expense']);
export type PaymentKind = z.infer<typeof PaymentKindEnum>;

export const ClassificationInput = z.object({
  kind: PaymentKindEnum,
  amount: z.number(),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  counterparty: z.string().nullable(),
});
export type ClassificationInputT = z.infer<typeof ClassificationInput>;

export const ClassificationOutput = z.object({
  category: CategoryEnum,
  suggestedDescription: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ClassificationOutputT = z.infer<typeof ClassificationOutput>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/ai/src/mastra/mp-classification/
git commit -m "feat(ai): classification schemas"
```

### Task 3.2: ClassifyMpEvent workflow

**Files:**
- Create: `apps/ai/src/mastra/mp-classification/workflows/classify-mp-event.ts`

- [ ] **Step 1: Implement**

```ts
// apps/ai/src/mastra/mp-classification/workflows/classify-mp-event.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import {
  ClassificationInput, ClassificationOutput, CategoryEnum,
} from '../domain/classification';
import { z } from 'zod';

const PromptCategory = z.object({
  category: CategoryEnum,
  confidence: z.number().min(0).max(1),
});

const PromptDescription = z.object({ suggestedDescription: z.string().max(80) });

const pickCategory = createStep({
  id: 'pick-category',
  inputSchema: ClassificationInput,
  outputSchema: ClassificationInput.extend({
    category: CategoryEnum, confidence: z.number(),
  }),
  execute: async ({ inputData }) => {
    if (inputData.kind === 'income') {
      return { ...inputData, category: 'otros', confidence: 1 };
    }
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: PromptCategory,
      prompt: `Classify this Argentine spending transaction into ONE category.
Categories: comida, transporte, entretenimiento, salud, servicios, educacion, otros.
Use otros only when nothing else fits.

Merchant: ${inputData.merchant ?? 'unknown'}
Description: ${inputData.description ?? 'none'}
Amount (ARS): ${inputData.amount}

Return the category and your confidence (0..1).`,
    });
    return { ...inputData, category: object.category, confidence: object.confidence };
  },
});

const draftDescription = createStep({
  id: 'draft-description',
  inputSchema: pickCategory.outputSchema,
  outputSchema: ClassificationOutput,
  execute: async ({ inputData }) => {
    const merchant = inputData.merchant ?? 'Mercado Pago';
    if (inputData.kind === 'income') {
      const counterparty = inputData.counterparty ?? 'desconocido';
      return {
        category: 'otros',
        suggestedDescription: `Pago entrante de ${counterparty}`,
        confidence: 1,
      };
    }
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: PromptDescription,
      prompt: `Write a SHORT Spanish description (max 60 chars) for this expense.
Merchant: ${merchant}
Existing description: ${inputData.description ?? 'none'}
Category: ${inputData.category}

Style: neutral, concise, no exclamations. Examples:
- "Pedido Rappi"
- "Almuerzo en Don Julio"
- "Suscripción Netflix"
- "Servicio de Edenor"`,
    });
    return {
      category: inputData.category,
      suggestedDescription: object.suggestedDescription,
      confidence: inputData.confidence,
    };
  },
});

export const classifyMpEvent = createWorkflow({
  id: 'classify-mp-event',
  inputSchema: ClassificationInput,
  outputSchema: ClassificationOutput,
})
  .then(pickCategory)
  .then(draftDescription)
  .commit();
```

- [ ] **Step 2: Commit**

```bash
git add apps/ai/src/mastra/mp-classification/workflows/
git commit -m "feat(ai): classify-mp-event workflow (Mastra Workflow primitive)"
```

### Task 3.3: Register workflow in Mastra config

**Files:**
- Modify: `apps/ai/src/mastra/index.ts`

- [ ] **Step 1: Update**

```ts
// apps/ai/src/mastra/index.ts
import { Mastra } from '@mastra/core';
import { placeholderAgent } from './agents';
import { classifyMpEvent } from './mp-classification/workflows/classify-mp-event';

export const mastra = new Mastra({
  agents: { placeholderAgent },
  workflows: { classifyMpEvent },
});
```

- [ ] **Step 2: Verify boot**

Run: `bun dev --filter=ai`. The Mastra dev playground at the printed URL should list `classify-mp-event` under Workflows.

- [ ] **Step 3: Smoke-test via curl**

```bash
curl -X POST http://localhost:4111/api/workflows/classify-mp-event/start \
  -H 'content-type: application/json' \
  -d '{"runId":"smoke","inputData":{"kind":"expense","amount":12500,"merchant":"Rappi","description":"Compra Rappi","counterparty":"Rappi"}}'
```

Expected: a `runId` returned, then `GET /api/workflows/classify-mp-event/runs/smoke/result` shows `{ category: "comida", ... }`.

- [ ] **Step 4: Commit**

```bash
git add apps/ai/src/mastra/index.ts
git commit -m "feat(ai): register classify-mp-event workflow"
```

---

## Phase 4 — apps/api: MP webhook + classifier integration

### Task 4.1: Domain helpers — isCompletedPayment + mapMpStatusToTransactionStatus

**Files:**
- Create: `apps/api/src/mp/domain/is-completed-payment.ts`
- Create: `apps/api/src/mp/domain/map-mp-status.ts`
- Test: `apps/api/src/mp/domain/is-completed-payment.test.ts`
- Test: `apps/api/src/mp/domain/map-mp-status.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/mp/domain/is-completed-payment.test.ts
import { describe, it, expect } from 'bun:test';
import { isCompletedPayment } from './is-completed-payment';

describe('isCompletedPayment', () => {
  const base = { status: 'approved', status_detail: 'accredited' } as any;
  it('true on approved+accredited', () => expect(isCompletedPayment(base)).toBe(true));
  it('true on approved+accredited+captured', () =>
    expect(isCompletedPayment({ ...base, captured: true })).toBe(true));
  it('false when captured=false', () =>
    expect(isCompletedPayment({ ...base, captured: false })).toBe(false));
  it('false when status_detail != accredited', () =>
    expect(isCompletedPayment({ ...base, status_detail: 'pending_capture' })).toBe(false));
  it('false when status != approved', () =>
    expect(isCompletedPayment({ ...base, status: 'authorized' })).toBe(false));
  it('false on rejected', () =>
    expect(isCompletedPayment({ status: 'rejected', status_detail: 'cc_rejected' } as any)).toBe(false));
});
```

```ts
// apps/api/src/mp/domain/map-mp-status.test.ts
import { describe, it, expect } from 'bun:test';
import { mapMpStatusToTransactionStatus } from './map-mp-status';

describe('mapMpStatusToTransactionStatus', () => {
  it('refunded → refunded', () => expect(mapMpStatusToTransactionStatus('refunded')).toBe('refunded'));
  it('charged_back → charged_back', () => expect(mapMpStatusToTransactionStatus('charged_back')).toBe('charged_back'));
  it('approved → active', () => expect(mapMpStatusToTransactionStatus('approved')).toBe('active'));
  it('rejected → active (only mapping reversals)', () =>
    expect(mapMpStatusToTransactionStatus('rejected')).toBe('active'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test apps/api/src/mp/domain/`
Expected: module-not-found errors.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/mp/domain/is-completed-payment.ts
import type { Payment } from 'mercadopago';

export function isCompletedPayment(p: Pick<Payment, 'status' | 'status_detail' | 'captured'>): boolean {
  if (p.status !== 'approved') return false;
  if (p.status_detail !== 'accredited') return false;
  if (p.captured === false) return false;
  return true;
}
```

```ts
// apps/api/src/mp/domain/map-mp-status.ts
export type TransactionStatus = 'active' | 'refunded' | 'charged_back';

export function mapMpStatusToTransactionStatus(s: string | null | undefined): TransactionStatus {
  if (s === 'refunded') return 'refunded';
  if (s === 'charged_back') return 'charged_back';
  return 'active';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test apps/api/src/mp/domain/`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/domain/
git commit -m "feat(api): MP domain helpers (isCompletedPayment, mapMpStatus)"
```

### Task 4.2: MpSignatureVerifier (with test)

**Files:**
- Create: `apps/api/src/mp/providers/mp-signature-verifier.ts`
- Test: `apps/api/src/mp/providers/mp-signature-verifier.test.ts`

- [ ] **Step 1: Write the failing test using MP's documented manifest**

```ts
// apps/api/src/mp/providers/mp-signature-verifier.test.ts
import { describe, it, expect } from 'bun:test';
import { createHmac } from 'node:crypto';
import { MpSignatureVerifier } from './mp-signature-verifier';

const SECRET = 'top_secret';
const v = new MpSignatureVerifier(SECRET);

function makeSig(dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const sha = createHmac('sha256', SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${sha}`;
}

describe('MpSignatureVerifier', () => {
  it('verifies a well-formed signature', () => {
    const xsig = makeSig('PAY_123', 'req_abc', '1700000000');
    expect(v.verify({
      xSignature: xsig, xRequestId: 'req_abc', dataId: 'PAY_123',
    })).toBe(true);
  });

  it('lowercases alphanumeric data.id per MP rule', () => {
    const xsig = makeSig('pay_abc', 'req_abc', '1700000000');
    expect(v.verify({
      xSignature: xsig, xRequestId: 'req_abc', dataId: 'PAY_ABC',
    })).toBe(true);
  });

  it('rejects wrong signature', () => {
    expect(v.verify({
      xSignature: 'ts=1,v1=deadbeef', xRequestId: 'req', dataId: 'p',
    })).toBe(false);
  });

  it('rejects malformed header', () => {
    expect(v.verify({
      xSignature: 'nope', xRequestId: 'r', dataId: 'p',
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `bun test apps/api/src/mp/providers/mp-signature-verifier.test.ts`
Expected: fail.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/mp/providers/mp-signature-verifier.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MpSignatureVerifier {
  private readonly secret: string;

  constructor(secretOrCfg: string | ConfigService) {
    this.secret = typeof secretOrCfg === 'string'
      ? secretOrCfg
      : secretOrCfg.getOrThrow<string>('MP_WEBHOOK_SECRET');
  }

  verify(input: { xSignature: string; xRequestId: string; dataId: string }): boolean {
    const parts = input.xSignature.split(',');
    const ts = parts.find((p) => p.startsWith('ts='))?.slice(3);
    const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3);
    if (!ts || !v1) return false;

    const dataIdNormalized = /^[a-z0-9]+$/i.test(input.dataId)
      ? input.dataId.toLowerCase() : input.dataId;

    const manifest = `id:${dataIdNormalized};request-id:${input.xRequestId};ts:${ts};`;
    const expected = createHmac('sha256', this.secret).update(manifest).digest('hex');

    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(v1, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test apps/api/src/mp/providers/mp-signature-verifier.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mp/providers/mp-signature-verifier.ts apps/api/src/mp/providers/mp-signature-verifier.test.ts
git commit -m "feat(api): MP webhook signature verifier (HMAC SHA-256)"
```

### Task 4.3: MpPaymentSource interface + MercadoPagoProvider

**Files:**
- Create: `apps/api/src/mp/domain/mp-payment-source.ts`
- Create: `apps/api/src/mp/providers/mercado-pago.provider.ts`

- [ ] **Step 1: Create interface**

```ts
// apps/api/src/mp/domain/mp-payment-source.ts
import type { Payment } from 'mercadopago';

export const MP_PAYMENT_SOURCE = Symbol('MP_PAYMENT_SOURCE');

export interface MpPaymentSource {
  getById(paymentId: string): Promise<Payment>;
}
```

- [ ] **Step 2: Implement provider**

```ts
// apps/api/src/mp/providers/mercado-pago.provider.ts
import { Inject, Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import type { MpPaymentSource } from '../domain/mp-payment-source';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';
import {
  USERS_REPOSITORY, UsersRepository,
} from '../../users/domain/users.repository';
import { RefreshMpToken } from '../../users/use-cases/refresh-mp-token';
import { isMpTokenExpired } from '../../users/domain/user';

@Injectable()
export class MercadoPagoProvider implements MpPaymentSource {
  constructor(
    private readonly current: CurrentUserProvider,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly refresher: RefreshMpToken,
  ) {}

  async getById(paymentId: string) {
    const token = await this.freshToken();
    const client = new MercadoPagoConfig({ accessToken: token });
    return new Payment(client).get({ id: paymentId }) as any;
  }

  private async freshToken(): Promise<string> {
    let user = await this.current.get();
    if (!user.mpAccessToken) throw new Error('MP not connected');
    if (isMpTokenExpired(user)) {
      const newToken = await this.refresher.execute(user.id, user.mpRefreshToken!);
      return newToken;
    }
    return user.mpAccessToken;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mp/domain/mp-payment-source.ts apps/api/src/mp/providers/mercado-pago.provider.ts
git commit -m "feat(api): MercadoPagoProvider with token refresh on read"
```

### Task 4.4: PaymentClassifier interface + HttpPaymentClassifier

**Files:**
- Create: `apps/api/src/mp/domain/payment-classifier.ts`
- Create: `apps/api/src/mp/domain/classification.ts`
- Create: `apps/api/src/mp/providers/http-payment-classifier.ts`

- [ ] **Step 1: Create types**

```ts
// apps/api/src/mp/domain/classification.ts
export type ExpenseCategory =
  | 'comida' | 'transporte' | 'entretenimiento' | 'salud'
  | 'servicios' | 'educacion' | 'otros';

export interface Classification {
  readonly category: ExpenseCategory;
  readonly suggestedDescription: string;
  readonly confidence: number;
}
```

```ts
// apps/api/src/mp/domain/payment-classifier.ts
import type { Classification, ExpenseCategory } from './classification';

export const PAYMENT_CLASSIFIER = Symbol('PAYMENT_CLASSIFIER');
export type PaymentKind = 'income' | 'expense';

export interface ClassifyArgs {
  readonly kind: PaymentKind;
  readonly amount: number;
  readonly merchant: string | null;
  readonly description: string | null;
  readonly counterparty: string | null;
}

export interface PaymentClassifier {
  classify(args: ClassifyArgs): Promise<Classification>;
}
```

- [ ] **Step 2: Implement HTTP classifier**

```ts
// apps/api/src/mp/providers/http-payment-classifier.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentClassifier, ClassifyArgs } from '../domain/payment-classifier';
import type { Classification } from '../domain/classification';

@Injectable()
export class HttpPaymentClassifier implements PaymentClassifier {
  private readonly log = new Logger('HttpPaymentClassifier');
  private readonly base: string;

  constructor(cfg: ConfigService) {
    this.base = cfg.get<string>('AI_BASE_URL') ?? 'http://localhost:4111';
  }

  async classify(args: ClassifyArgs): Promise<Classification> {
    try {
      return await this.runOnce(args);
    } catch (e1) {
      this.log.warn(`classifier first attempt failed: ${e1}`);
      try { return await this.runOnce(args); } catch (e2) {
        this.log.warn(`classifier failed twice; falling back: ${e2}`);
        return this.fallback(args);
      }
    }
  }

  private async runOnce(args: ClassifyArgs): Promise<Classification> {
    const start = await fetch(
      `${this.base}/api/workflows/classify-mp-event/start`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: 'r_' + Date.now(), inputData: args }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!start.ok) throw new Error(`start failed: ${start.status}`);
    const { runId } = await start.json() as { runId: string };

    // poll the run result with short backoff up to ~6s
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const r = await fetch(`${this.base}/api/workflows/classify-mp-event/runs/${runId}/result`);
      if (r.ok) {
        const body = await r.json() as any;
        if (body?.status === 'success' && body.result) {
          return body.result as Classification;
        }
        if (body?.status === 'failed') throw new Error('workflow failed');
      }
    }
    throw new Error('classifier timeout');
  }

  private fallback(args: ClassifyArgs): Classification {
    return {
      category: 'otros',
      suggestedDescription: args.merchant ?? 'Movimiento de Mercado Pago',
      confidence: 0,
    };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mp/domain/classification.ts apps/api/src/mp/domain/payment-classifier.ts apps/api/src/mp/providers/http-payment-classifier.ts
git commit -m "feat(api): HTTP payment classifier with retry + fallback"
```

### Task 4.5: MP webhook DTO + Zod

**Files:**
- Create: `apps/api/src/mp/interface/mp-webhook.dto.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/mp/interface/mp-webhook.dto.ts
import { z } from 'zod';

export const MpWebhookBodySchema = z.object({
  id: z.number().or(z.string()),
  live_mode: z.boolean(),
  type: z.string(),
  date_created: z.string().optional(),
  user_id: z.number().or(z.string()),
  api_version: z.string().optional(),
  action: z.string(),
  data: z.object({ id: z.string() }),
});
export type MpWebhookBody = z.infer<typeof MpWebhookBodySchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/mp/interface/mp-webhook.dto.ts
git commit -m "feat(api): MP webhook body schema"
```

---

## Phase 5 — apps/api: proactive state + SSE

### Task 5.1: PendingPrompt domain + repository interface + bus

**Files:**
- Create: `apps/api/src/proactive/domain/pending-prompt.ts`
- Create: `apps/api/src/proactive/domain/pending-prompts.repository.ts`
- Create: `apps/api/src/proactive/domain/proactive-event-bus.ts`

- [ ] **Step 1: Create `pending-prompt.ts`**

```ts
// apps/api/src/proactive/domain/pending-prompt.ts
import type { ExpenseCategory } from '../../mp/domain/classification';

export type PaymentKind = 'income' | 'expense';
export type PendingPromptStatus = 'pending' | 'added' | 'discarded' | 'auto';
export type ProactiveIntent = 'confirm' | 'notice';
export type NoticeReason = 'mp_refund' | 'mp_chargeback' | null;

export interface PendingPrompt {
  readonly id: string;
  readonly userId: string;
  readonly mpPaymentId: string;
  readonly kind: PaymentKind;
  readonly amount: number;
  readonly merchant: string | null;
  readonly paymentDate: Date;
  readonly suggestedCategory: ExpenseCategory;
  readonly suggestedDescription: string;
  readonly confidence: number;
  readonly intent: ProactiveIntent;
  readonly noticeReason: NoticeReason;
  readonly status: PendingPromptStatus;
  readonly resolvedTransactionId: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

export type NewPendingPromptInput = Omit<PendingPrompt,
  'id' | 'resolvedTransactionId' | 'resolvedAt' | 'createdAt'
>;
```

- [ ] **Step 2: Create repository interface**

```ts
// apps/api/src/proactive/domain/pending-prompts.repository.ts
import type { PendingPrompt, NewPendingPromptInput, NoticeReason } from './pending-prompt';

export const PENDING_PROMPTS_REPOSITORY = Symbol('PENDING_PROMPTS_REPOSITORY');

export interface PendingPromptsRepository {
  create(input: NewPendingPromptInput): Promise<PendingPrompt>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<PendingPrompt | null>;
  listOpen(userId: string): Promise<PendingPrompt[]>;       // pending + recent auto-notices
  getById(userId: string, id: string): Promise<PendingPrompt | null>;
  markAdded(id: string, txId: string): Promise<void>;
  markDiscarded(id: string, reason?: NoticeReason): Promise<void>;
}
```

- [ ] **Step 3: Create bus interface**

```ts
// apps/api/src/proactive/domain/proactive-event-bus.ts
import type { PendingPrompt } from './pending-prompt';

export const PROACTIVE_EVENT_BUS = Symbol('PROACTIVE_EVENT_BUS');

export type ProactiveEvent =
  | { type: 'prompt.created'; prompt: PendingPrompt }
  | { type: 'prompt.resolved'; promptId: string; status: PendingPrompt['status'];
      resolvedTransactionId: string | null };

export interface ProactiveEventBus {
  publish(userId: string, event: ProactiveEvent): void;
  subscribe(userId: string, fn: (e: ProactiveEvent) => void): () => void;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/proactive/domain/
git commit -m "feat(api): proactive domain — PendingPrompt + repo + bus contracts"
```

### Task 5.2: LibsqlPendingPromptsRepository

**Files:**
- Create: `apps/api/src/proactive/repositories/libsql-pending-prompts.repository.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/proactive/repositories/libsql-pending-prompts.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DB } from '../../shared/db/db.module';
import type { Db } from '../../shared/db/libsql.client';
import type {
  PendingPromptsRepository,
} from '../domain/pending-prompts.repository';
import type {
  NewPendingPromptInput, NoticeReason, PendingPrompt,
} from '../domain/pending-prompt';
import type { ExpenseCategory } from '../../mp/domain/classification';

@Injectable()
export class LibsqlPendingPromptsRepository implements PendingPromptsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(input: NewPendingPromptInput): Promise<PendingPrompt> {
    const id = 'p_' + randomUUID();
    const createdAt = new Date();
    await this.db.execute({
      sql: `insert into pending_prompts
            (id, user_id, mp_payment_id, kind, amount, merchant, payment_date,
             suggested_category, suggested_description, confidence,
             intent, notice_reason, status, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, input.userId, input.mpPaymentId, input.kind, input.amount, input.merchant,
        input.paymentDate.toISOString(), input.suggestedCategory,
        input.suggestedDescription, input.confidence,
        input.intent, input.noticeReason, input.status, createdAt.toISOString(),
      ],
    });
    return { ...input, id, resolvedTransactionId: null, resolvedAt: null, createdAt };
  }

  async findByMpPaymentId(userId: string, mpPaymentId: string) {
    const res = await this.db.execute({
      sql: `select * from pending_prompts where user_id = ? and mp_payment_id = ?`,
      args: [userId, mpPaymentId],
    });
    return res.rows.length ? this.toEntity(res.rows[0] as any) : null;
  }

  async listOpen(userId: string) {
    const res = await this.db.execute({
      sql: `select * from pending_prompts
            where user_id = ?
              and (status = 'pending' or (status = 'auto' and intent = 'notice'))
            order by created_at asc`,
      args: [userId],
    });
    return res.rows.map((r) => this.toEntity(r as any));
  }

  async getById(userId: string, id: string) {
    const res = await this.db.execute({
      sql: `select * from pending_prompts where user_id = ? and id = ?`,
      args: [userId, id],
    });
    return res.rows.length ? this.toEntity(res.rows[0] as any) : null;
  }

  async markAdded(id: string, txId: string) {
    await this.db.execute({
      sql: `update pending_prompts
            set status = 'added', resolved_transaction_id = ?, resolved_at = ?
            where id = ?`,
      args: [txId, new Date().toISOString(), id],
    });
  }

  async markDiscarded(id: string, reason: NoticeReason = null) {
    await this.db.execute({
      sql: `update pending_prompts
            set status = 'discarded', notice_reason = coalesce(notice_reason, ?), resolved_at = ?
            where id = ?`,
      args: [reason, new Date().toISOString(), id],
    });
  }

  private toEntity(r: any): PendingPrompt {
    return {
      id: r.id,
      userId: r.user_id,
      mpPaymentId: r.mp_payment_id,
      kind: r.kind,
      amount: r.amount,
      merchant: r.merchant,
      paymentDate: new Date(r.payment_date),
      suggestedCategory: r.suggested_category as ExpenseCategory,
      suggestedDescription: r.suggested_description,
      confidence: r.confidence,
      intent: r.intent,
      noticeReason: r.notice_reason,
      status: r.status,
      resolvedTransactionId: r.resolved_transaction_id,
      createdAt: new Date(r.created_at),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/proactive/repositories/
git commit -m "feat(api): libsql pending prompts repository"
```

### Task 5.3: InMemoryProactiveEventBus

**Files:**
- Create: `apps/api/src/proactive/providers/in-memory-proactive-event-bus.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/proactive/providers/in-memory-proactive-event-bus.ts
import { Injectable } from '@nestjs/common';
import type {
  ProactiveEvent, ProactiveEventBus,
} from '../domain/proactive-event-bus';

@Injectable()
export class InMemoryProactiveEventBus implements ProactiveEventBus {
  private readonly byUser = new Map<string, Set<(e: ProactiveEvent) => void>>();

  publish(userId: string, event: ProactiveEvent): void {
    this.byUser.get(userId)?.forEach((fn) => {
      try { fn(event); } catch { /* swallow per-subscriber errors */ }
    });
  }

  subscribe(userId: string, fn: (e: ProactiveEvent) => void): () => void {
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(fn);
    return () => {
      const set = this.byUser.get(userId);
      set?.delete(fn);
      if (set && set.size === 0) this.byUser.delete(userId);
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/proactive/providers/
git commit -m "feat(api): in-memory proactive event bus"
```

### Task 5.4: ListPendingPrompts use-case

**Files:**
- Create: `apps/api/src/proactive/use-cases/list-pending-prompts.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/proactive/use-cases/list-pending-prompts.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  PENDING_PROMPTS_REPOSITORY, PendingPromptsRepository,
} from '../domain/pending-prompts.repository';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';

@Injectable()
export class ListPendingPrompts {
  constructor(
    @Inject(PENDING_PROMPTS_REPOSITORY) private readonly repo: PendingPromptsRepository,
    private readonly current: CurrentUserProvider,
  ) {}
  async execute() {
    const user = await this.current.get();
    return this.repo.listOpen(user.id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/proactive/use-cases/
git commit -m "feat(api): list pending prompts use-case"
```

### Task 5.5: Proactive controller (SSE + REST endpoints minus resolve)

**Files:**
- Create: `apps/api/src/proactive/interface/proactive.controller.ts`

- [ ] **Step 1: Implement (resolve will be added after AddTransaction is built)**

```ts
// apps/api/src/proactive/interface/proactive.controller.ts
import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  PROACTIVE_EVENT_BUS, ProactiveEventBus,
} from '../domain/proactive-event-bus';
import { ListPendingPrompts } from '../use-cases/list-pending-prompts';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';

@Controller('proactive')
export class ProactiveController {
  constructor(
    private readonly list: ListPendingPrompts,
    private readonly current: CurrentUserProvider,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
  ) {}

  @Get('pending')
  async pending() {
    const prompts = await this.list.execute();
    return { prompts };
  }

  @Get('stream')
  async stream(@Res() res: Response) {
    const user = await this.current.get();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`: connected\n\n`);

    const unsub = this.bus.subscribe(user.id, (event) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => res.write(`: hb\n\n`), 15000);

    res.on('close', () => {
      clearInterval(heartbeat);
      unsub();
      res.end();
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/proactive/interface/
git commit -m "feat(api): proactive controller — SSE stream + /pending"
```

### Task 5.6: Proactive module (no resolve yet)

**Files:**
- Create: `apps/api/src/proactive/proactive.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Module**

```ts
// apps/api/src/proactive/proactive.module.ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PENDING_PROMPTS_REPOSITORY } from './domain/pending-prompts.repository';
import { PROACTIVE_EVENT_BUS } from './domain/proactive-event-bus';
import { LibsqlPendingPromptsRepository } from './repositories/libsql-pending-prompts.repository';
import { InMemoryProactiveEventBus } from './providers/in-memory-proactive-event-bus';
import { ListPendingPrompts } from './use-cases/list-pending-prompts';
import { ProactiveController } from './interface/proactive.controller';

@Module({
  imports: [UsersModule],
  controllers: [ProactiveController],
  providers: [
    { provide: PENDING_PROMPTS_REPOSITORY, useClass: LibsqlPendingPromptsRepository },
    { provide: PROACTIVE_EVENT_BUS, useClass: InMemoryProactiveEventBus },
    ListPendingPrompts,
  ],
  exports: [PENDING_PROMPTS_REPOSITORY, PROACTIVE_EVENT_BUS],
})
export class ProactiveModule {}
```

- [ ] **Step 2: Register in `app.module.ts`**

Add `ProactiveModule` to `imports`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/proactive/proactive.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): proactive module wiring (no resolve yet)"
```

---

## Phase 6 — apps/api: transactions feature

### Task 6.1: Transaction domain + repository interface

**Files:**
- Create: `apps/api/src/transactions/domain/transaction.ts`
- Create: `apps/api/src/transactions/domain/transactions.repository.ts`

- [ ] **Step 1: Create entity**

```ts
// apps/api/src/transactions/domain/transaction.ts
import type { ExpenseCategory } from '../../mp/domain/classification';

export type TransactionDirection = 'expense' | 'income';
export type TransactionStatus = 'active' | 'refunded' | 'charged_back';
export type TransactionSource = 'manual' | 'mp_webhook';

export interface Transaction {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly amount: number;
  readonly currency: 'ARS';
  readonly category: ExpenseCategory;
  readonly description: string;
  readonly merchant: string;
  readonly direction: TransactionDirection;
  readonly status: TransactionStatus;
  readonly statusChangedAt: Date | null;
  readonly source: TransactionSource;
  readonly mpPaymentId: string | null;
}

export type NewTransactionInput = Omit<Transaction, 'id' | 'statusChangedAt'>;
```

- [ ] **Step 2: Create repository interface**

```ts
// apps/api/src/transactions/domain/transactions.repository.ts
import type { NewTransactionInput, Transaction, TransactionStatus } from './transaction';

export const TRANSACTIONS_REPOSITORY = Symbol('TRANSACTIONS_REPOSITORY');

export interface TransactionsRepository {
  create(input: NewTransactionInput): Promise<Transaction>;
  getById(userId: string, id: string): Promise<Transaction>;
  findByMpPaymentId(userId: string, mpPaymentId: string): Promise<Transaction | null>;
  updateStatus(id: string, newStatus: TransactionStatus, at: Date): Promise<void>;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/transactions/domain/
git commit -m "feat(api): transactions domain (entity + repo contract)"
```

### Task 6.2: LibsqlTransactionsRepository

**Files:**
- Create: `apps/api/src/transactions/repositories/libsql-transactions.repository.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/transactions/repositories/libsql-transactions.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DB } from '../../shared/db/db.module';
import type { Db } from '../../shared/db/libsql.client';
import type {
  TransactionsRepository,
} from '../domain/transactions.repository';
import type {
  NewTransactionInput, Transaction, TransactionStatus,
} from '../domain/transaction';
import type { ExpenseCategory } from '../../mp/domain/classification';

@Injectable()
export class LibsqlTransactionsRepository implements TransactionsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(input: NewTransactionInput): Promise<Transaction> {
    const id = 'tx_' + randomUUID();
    await this.db.execute({
      sql: `insert into transactions
            (id, user_id, date, amount, currency, category, description, merchant,
             direction, status, source, mp_payment_id)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, input.userId, input.date, input.amount, input.currency,
        input.category, input.description, input.merchant,
        input.direction, input.status, input.source, input.mpPaymentId,
      ],
    });
    return { ...input, id, statusChangedAt: null };
  }

  async getById(userId: string, id: string): Promise<Transaction> {
    const res = await this.db.execute({
      sql: `select * from transactions where user_id = ? and id = ?`,
      args: [userId, id],
    });
    if (!res.rows.length) throw new Error(`transaction not found: ${id}`);
    return this.toEntity(res.rows[0] as any);
  }

  async findByMpPaymentId(userId: string, mpPaymentId: string) {
    const res = await this.db.execute({
      sql: `select * from transactions where user_id = ? and mp_payment_id = ?`,
      args: [userId, mpPaymentId],
    });
    return res.rows.length ? this.toEntity(res.rows[0] as any) : null;
  }

  async updateStatus(id: string, newStatus: TransactionStatus, at: Date): Promise<void> {
    await this.db.execute({
      sql: `update transactions set status = ?, status_changed_at = ? where id = ?`,
      args: [newStatus, at.toISOString(), id],
    });
  }

  private toEntity(r: any): Transaction {
    return {
      id: r.id, userId: r.user_id, date: r.date,
      amount: r.amount, currency: r.currency,
      category: r.category as ExpenseCategory,
      description: r.description, merchant: r.merchant,
      direction: r.direction, status: r.status,
      statusChangedAt: r.status_changed_at ? new Date(r.status_changed_at) : null,
      source: r.source, mpPaymentId: r.mp_payment_id,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/transactions/repositories/
git commit -m "feat(api): libsql transactions repository"
```

### Task 6.3: AddTransaction + MarkTransactionReversed use-cases (with idempotency test)

**Files:**
- Create: `apps/api/src/transactions/use-cases/add-transaction.ts`
- Create: `apps/api/src/transactions/use-cases/mark-transaction-reversed.ts`
- Test: `apps/api/src/transactions/use-cases/mark-transaction-reversed.test.ts`

- [ ] **Step 1: AddTransaction**

```ts
// apps/api/src/transactions/use-cases/add-transaction.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTIONS_REPOSITORY, TransactionsRepository,
} from '../domain/transactions.repository';
import type { NewTransactionInput, Transaction } from '../domain/transaction';

@Injectable()
export class AddTransaction {
  constructor(@Inject(TRANSACTIONS_REPOSITORY) private readonly repo: TransactionsRepository) {}
  execute(input: NewTransactionInput): Promise<Transaction> {
    return this.repo.create(input);
  }
}
```

- [ ] **Step 2: MarkTransactionReversed**

```ts
// apps/api/src/transactions/use-cases/mark-transaction-reversed.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTIONS_REPOSITORY, TransactionsRepository,
} from '../domain/transactions.repository';
import type { TransactionStatus } from '../domain/transaction';
import {
  PENDING_PROMPTS_REPOSITORY, PendingPromptsRepository,
} from '../../proactive/domain/pending-prompts.repository';
import {
  PROACTIVE_EVENT_BUS, ProactiveEventBus,
} from '../../proactive/domain/proactive-event-bus';

@Injectable()
export class MarkTransactionReversed {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txs: TransactionsRepository,
    @Inject(PENDING_PROMPTS_REPOSITORY) private readonly prompts: PendingPromptsRepository,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
  ) {}

  async execute(input: {
    userId: string; transactionId: string; mpPaymentId: string;
    newStatus: Exclude<TransactionStatus, 'active'>;
  }): Promise<void> {
    const tx = await this.txs.getById(input.userId, input.transactionId);
    if (tx.status === input.newStatus) return;       // idempotent

    await this.txs.updateStatus(tx.id, input.newStatus, new Date());

    const notice = await this.prompts.create({
      userId: input.userId,
      mpPaymentId: `${input.mpPaymentId}:reversal`,
      kind: tx.direction === 'expense' ? 'income' : 'expense',
      amount: tx.amount,
      merchant: tx.merchant,
      paymentDate: new Date(),
      suggestedCategory: tx.category,
      suggestedDescription: `Reembolso: ${tx.description}`,
      confidence: 1,
      intent: 'notice',
      noticeReason: input.newStatus === 'refunded' ? 'mp_refund' : 'mp_chargeback',
      status: 'auto',
    });

    this.bus.publish(input.userId, { type: 'prompt.created', prompt: notice });
  }
}
```

- [ ] **Step 3: Idempotency test (with stubs)**

```ts
// apps/api/src/transactions/use-cases/mark-transaction-reversed.test.ts
import { describe, it, expect } from 'bun:test';
import { MarkTransactionReversed } from './mark-transaction-reversed';

function makeStubs() {
  const txs = {
    state: { id: 'tx_1', status: 'refunded' } as any,
    update: 0,
    async getById() { return this.state; },
    async updateStatus() { this.update++; },
    async create() { return {} as any; },
    async findByMpPaymentId() { return null; },
  };
  const prompts = {
    created: 0,
    async create() { this.created++; return {} as any; },
    async findByMpPaymentId() { return null; },
    async listOpen() { return []; },
    async getById() { return null; },
    async markAdded() {}, async markDiscarded() {},
  };
  const bus = { published: 0, publish() { this.published++; }, subscribe: () => () => {} };
  return { txs, prompts, bus };
}

describe('MarkTransactionReversed', () => {
  it('is a no-op when status already matches', async () => {
    const { txs, prompts, bus } = makeStubs();
    const uc = new MarkTransactionReversed(txs as any, prompts as any, bus as any);
    await uc.execute({
      userId: 'u', transactionId: 'tx_1', mpPaymentId: 'PAY_1', newStatus: 'refunded',
    });
    expect(txs.update).toBe(0);
    expect(prompts.created).toBe(0);
    expect(bus.published).toBe(0);
  });

  it('updates + creates notice + publishes when status differs', async () => {
    const { txs, prompts, bus } = makeStubs();
    txs.state = {
      id: 'tx_1', status: 'active', direction: 'expense',
      amount: 12500, merchant: 'Rappi', category: 'comida',
      description: 'Pedido Rappi',
    } as any;
    const uc = new MarkTransactionReversed(txs as any, prompts as any, bus as any);
    await uc.execute({
      userId: 'u', transactionId: 'tx_1', mpPaymentId: 'PAY_1', newStatus: 'refunded',
    });
    expect(txs.update).toBe(1);
    expect(prompts.created).toBe(1);
    expect(bus.published).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `bun test apps/api/src/transactions/use-cases/`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions/use-cases/
git commit -m "feat(api): AddTransaction + MarkTransactionReversed (idempotent)"
```

### Task 6.4: Transactions module

**Files:**
- Create: `apps/api/src/transactions/transactions.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Module**

```ts
// apps/api/src/transactions/transactions.module.ts
import { Module } from '@nestjs/common';
import { ProactiveModule } from '../proactive/proactive.module';
import { TRANSACTIONS_REPOSITORY } from './domain/transactions.repository';
import { LibsqlTransactionsRepository } from './repositories/libsql-transactions.repository';
import { AddTransaction } from './use-cases/add-transaction';
import { MarkTransactionReversed } from './use-cases/mark-transaction-reversed';

@Module({
  imports: [ProactiveModule],
  providers: [
    { provide: TRANSACTIONS_REPOSITORY, useClass: LibsqlTransactionsRepository },
    AddTransaction,
    MarkTransactionReversed,
  ],
  exports: [TRANSACTIONS_REPOSITORY, AddTransaction, MarkTransactionReversed],
})
export class TransactionsModule {}
```

- [ ] **Step 2: Register in `app.module.ts`**

Add `TransactionsModule` to `imports` (after `ProactiveModule`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/transactions/transactions.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): transactions module wiring"
```

---

## Phase 7 — apps/api: the orchestrator (ProcessMpEvent) + webhook controller

### Task 7.1: ProcessMpEvent use-case (all three branches)

**Files:**
- Create: `apps/api/src/mp/use-cases/process-mp-event.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/mp/use-cases/process-mp-event.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MP_PAYMENT_SOURCE, MpPaymentSource,
} from '../domain/mp-payment-source';
import {
  PAYMENT_CLASSIFIER, PaymentClassifier,
} from '../domain/payment-classifier';
import { isCompletedPayment } from '../domain/is-completed-payment';
import { mapMpStatusToTransactionStatus } from '../domain/map-mp-status';
import {
  USERS_REPOSITORY, UsersRepository,
} from '../../users/domain/users.repository';
import {
  PENDING_PROMPTS_REPOSITORY, PendingPromptsRepository,
} from '../../proactive/domain/pending-prompts.repository';
import {
  PROACTIVE_EVENT_BUS, ProactiveEventBus,
} from '../../proactive/domain/proactive-event-bus';
import {
  TRANSACTIONS_REPOSITORY, TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { MarkTransactionReversed } from '../../transactions/use-cases/mark-transaction-reversed';

@Injectable()
export class ProcessMpEvent {
  private readonly log = new Logger('ProcessMpEvent');

  constructor(
    @Inject(MP_PAYMENT_SOURCE) private readonly mp: MpPaymentSource,
    @Inject(PAYMENT_CLASSIFIER) private readonly classifier: PaymentClassifier,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txs: TransactionsRepository,
    @Inject(PENDING_PROMPTS_REPOSITORY) private readonly prompts: PendingPromptsRepository,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
    private readonly markReversed: MarkTransactionReversed,
  ) {}

  async execute(input: { mpUserId: string; paymentId: string }): Promise<void> {
    const user = await this.users.findByMpUserId(input.mpUserId);
    if (!user) { this.log.warn(`unknown mp_user_id ${input.mpUserId}; drop`); return; }

    const payment: any = await this.mp.getById(input.paymentId);
    const newStatus = mapMpStatusToTransactionStatus(payment.status);

    const existingTx = await this.txs.findByMpPaymentId(user.id, input.paymentId);

    // Branch 1: existing tx — possibly a state change
    if (existingTx) {
      if (newStatus === existingTx.status) return;     // idempotent
      if (newStatus === 'active') return;              // weird re-approve; ignore
      await this.markReversed.execute({
        userId: user.id, transactionId: existingTx.id,
        mpPaymentId: input.paymentId, newStatus,
      });
      return;
    }

    // Branch 2: no tx and not a completed payment — handle drift on still-pending prompt
    if (!isCompletedPayment(payment)) {
      if (payment.status === 'refunded' || payment.status === 'charged_back') {
        const prompt = await this.prompts.findByMpPaymentId(user.id, input.paymentId);
        if (prompt && prompt.status === 'pending') {
          await this.prompts.markDiscarded(prompt.id,
            payment.status === 'refunded' ? 'mp_refund' : 'mp_chargeback');
          this.bus.publish(user.id, {
            type: 'prompt.resolved', promptId: prompt.id,
            status: 'discarded', resolvedTransactionId: null,
          });
        }
      }
      return;
    }

    // Branch 3: a brand-new completed payment → classify + create prompt
    const dedupe = await this.prompts.findByMpPaymentId(user.id, input.paymentId);
    if (dedupe) return;

    const isIncome = String(payment.collector?.id ?? '') === user.mpUserId;
    const kind = isIncome ? 'income' : 'expense';
    const counterparty = isIncome
      ? this.partyName(payment.payer)
      : this.partyName(payment.collector);

    const merchant = this.merchantOf(payment, isIncome);
    const classification = await this.classifier.classify({
      kind, amount: payment.transaction_amount,
      merchant, description: payment.description ?? null,
      counterparty,
    });

    const prompt = await this.prompts.create({
      userId: user.id,
      mpPaymentId: input.paymentId,
      kind,
      amount: payment.transaction_amount,
      merchant,
      paymentDate: new Date(payment.date_approved ?? Date.now()),
      suggestedCategory: classification.category,
      suggestedDescription: classification.suggestedDescription,
      confidence: classification.confidence,
      intent: 'confirm',
      noticeReason: null,
      status: 'pending',
    });

    this.bus.publish(user.id, { type: 'prompt.created', prompt });
  }

  private partyName(p: any): string | null {
    if (!p) return null;
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return name || p.email || null;
  }

  private merchantOf(p: any, isIncome: boolean): string | null {
    if (isIncome) return this.partyName(p.payer);
    return p.additional_info?.items?.[0]?.title
        ?? p.statement_descriptor
        ?? p.description
        ?? null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/mp/use-cases/process-mp-event.ts
git commit -m "feat(api): ProcessMpEvent orchestrator (3 branches)"
```

### Task 7.2: ProcessMpEvent integration test (in-memory fakes)

**Files:**
- Test: `apps/api/src/mp/use-cases/process-mp-event.test.ts`

- [ ] **Step 1: Write the test**

```ts
// apps/api/src/mp/use-cases/process-mp-event.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { ProcessMpEvent } from './process-mp-event';

function makeWorld() {
  const user = { id: 'u', mpUserId: '999', mpAccessToken: 'tok' } as any;

  const users = {
    async findByMpUserId(id: string) { return id === '999' ? user : null; },
  };

  const txState = new Map<string, any>();
  const txs = {
    async findByMpPaymentId(_u: string, mpId: string) {
      for (const t of txState.values()) if (t.mpPaymentId === mpId) return t;
      return null;
    },
    async getById(_u: string, id: string) { return txState.get(id); },
    async updateStatus(id: string, status: string) {
      const t = txState.get(id); if (t) { t.status = status; }
    },
    async create(input: any) {
      const id = 'tx_' + (txState.size + 1); const tx = { ...input, id };
      txState.set(id, tx); return tx;
    },
  };

  const promptState = new Map<string, any>();
  const prompts = {
    async findByMpPaymentId(_u: string, mpId: string) {
      for (const p of promptState.values()) if (p.mpPaymentId === mpId) return p;
      return null;
    },
    async create(input: any) {
      const id = 'p_' + (promptState.size + 1); const p = { ...input, id };
      promptState.set(id, p); return p;
    },
    async listOpen() { return [...promptState.values()].filter((p) => p.status === 'pending' || p.status === 'auto'); },
    async getById(_u: string, id: string) { return promptState.get(id) ?? null; },
    async markAdded(id: string, txId: string) {
      const p = promptState.get(id); if (p) { p.status = 'added'; p.resolvedTransactionId = txId; }
    },
    async markDiscarded(id: string, reason?: string) {
      const p = promptState.get(id); if (p) { p.status = 'discarded'; p.noticeReason = reason ?? null; }
    },
  };

  const events: any[] = [];
  const bus = {
    publish(_uid: string, e: any) { events.push(e); },
    subscribe: () => () => {},
  };

  const classifier = {
    async classify() { return { category: 'comida', suggestedDescription: 'Rappi', confidence: 0.9 }; },
  };

  const mp = {
    current: null as any,
    async getById() { return this.current; },
  };

  const markReversed = {
    async execute(input: any) {
      await txs.updateStatus(input.transactionId, input.newStatus);
      const notice = await prompts.create({
        mpPaymentId: `${input.mpPaymentId}:reversal`,
        intent: 'notice', noticeReason: input.newStatus === 'refunded' ? 'mp_refund' : 'mp_chargeback',
        status: 'auto', userId: input.userId, kind: 'income', amount: 0,
        merchant: null, paymentDate: new Date(), suggestedCategory: 'otros',
        suggestedDescription: 'Reembolso', confidence: 1,
      });
      bus.publish(input.userId, { type: 'prompt.created', prompt: notice });
    },
  };

  const sut = new ProcessMpEvent(
    mp as any, classifier as any, users as any, txs as any,
    prompts as any, bus as any, markReversed as any,
  );

  return { sut, mp, txs, prompts, bus, events, user };
}

describe('ProcessMpEvent', () => {
  let w: ReturnType<typeof makeWorld>;
  beforeEach(() => { w = makeWorld(); });

  it('drops on unknown mpUserId', async () => {
    w.mp.current = { status: 'approved' };
    await w.sut.execute({ mpUserId: 'NOPE', paymentId: 'P' });
    expect(w.events).toHaveLength(0);
  });

  it('branch 3: classifies and emits prompt for new approved+accredited expense', async () => {
    w.mp.current = {
      status: 'approved', status_detail: 'accredited',
      transaction_amount: 12500, date_approved: '2026-05-14T10:00:00Z',
      payer: { first_name: 'Alice' }, collector: { id: '777' },
      description: 'Pedido Rappi',
    };
    await w.sut.execute({ mpUserId: '999', paymentId: 'PAY_1' });
    expect(w.events).toHaveLength(1);
    expect(w.events[0].type).toBe('prompt.created');
    expect(w.events[0].prompt.suggestedCategory).toBe('comida');
  });

  it('branch 3: idempotent on retry (existing prompt → drop)', async () => {
    w.mp.current = {
      status: 'approved', status_detail: 'accredited',
      transaction_amount: 1, date_approved: new Date().toISOString(),
      payer: {}, collector: { id: '777' },
    };
    await w.sut.execute({ mpUserId: '999', paymentId: 'PAY_DUP' });
    await w.sut.execute({ mpUserId: '999', paymentId: 'PAY_DUP' });
    expect(w.events).toHaveLength(1);
  });

  it('branch 2: refund of a never-added payment marks pending prompt discarded', async () => {
    await w.prompts.create({
      userId: 'u', mpPaymentId: 'PAY_R', kind: 'expense', amount: 1,
      merchant: null, paymentDate: new Date(), suggestedCategory: 'otros',
      suggestedDescription: 'x', confidence: 0, intent: 'confirm',
      noticeReason: null, status: 'pending',
    } as any);
    w.mp.current = { status: 'refunded', status_detail: 'refunded' };
    await w.sut.execute({ mpUserId: '999', paymentId: 'PAY_R' });
    const e = w.events.find((e) => e.type === 'prompt.resolved');
    expect(e).toBeDefined();
    expect(e.status).toBe('discarded');
  });

  it('branch 1: refund of an existing tx triggers MarkTransactionReversed', async () => {
    await w.txs.create({
      userId: 'u', mpPaymentId: 'PAY_X', direction: 'expense',
      amount: 12500, merchant: 'Rappi', category: 'comida',
      description: 'Pedido Rappi', status: 'active',
      currency: 'ARS', date: '2026-05-14', source: 'mp_webhook',
    } as any);
    w.mp.current = { status: 'refunded', status_detail: 'refunded' };
    await w.sut.execute({ mpUserId: '999', paymentId: 'PAY_X' });
    const e = w.events.find((e) => e.type === 'prompt.created');
    expect(e).toBeDefined();
    expect(e.prompt.intent).toBe('notice');
    expect(e.prompt.noticeReason).toBe('mp_refund');
  });
});
```

- [ ] **Step 2: Run test**

Run: `bun test apps/api/src/mp/use-cases/process-mp-event.test.ts`
Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mp/use-cases/process-mp-event.test.ts
git commit -m "test(api): ProcessMpEvent branch coverage with in-memory fakes"
```

### Task 7.3: MP webhook controller (ack-fast pattern)

**Files:**
- Create: `apps/api/src/mp/interface/mp-webhook.controller.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/mp/interface/mp-webhook.controller.ts
import {
  BadRequestException, Body, Controller, Headers, Logger, Post,
  Res, UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { MpSignatureVerifier } from '../providers/mp-signature-verifier';
import { ProcessMpEvent } from '../use-cases/process-mp-event';
import { MpWebhookBodySchema } from './mp-webhook.dto';

@Controller('mp/webhook')
export class MpWebhookController {
  private readonly log = new Logger('MpWebhookController');

  constructor(
    private readonly verifier: MpSignatureVerifier,
    private readonly process: ProcessMpEvent,
  ) {}

  @Post()
  receive(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Body() rawBody: unknown,
    @Res() res: Response,
  ) {
    if (!xSignature || !xRequestId) {
      throw new BadRequestException('missing signature headers');
    }
    const parsed = MpWebhookBodySchema.safeParse(rawBody);
    if (!parsed.success) throw new BadRequestException('invalid body');

    const ok = this.verifier.verify({
      xSignature, xRequestId, dataId: parsed.data.data.id,
    });
    if (!ok) throw new UnauthorizedException('bad signature');

    if (parsed.data.type !== 'payment') { res.status(200).send(); return; }

    res.status(200).send();   // ACK fast

    // fire-and-forget
    void this.process.execute({
      mpUserId: String(parsed.data.user_id),
      paymentId: parsed.data.data.id,
    }).catch((e) => this.log.error('ProcessMpEvent failed', e as any));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/mp/interface/mp-webhook.controller.ts
git commit -m "feat(api): MP webhook controller (ack-fast + dispatch)"
```

### Task 7.4: Complete the MP module + register webhook + classifier

**Files:**
- Modify: `apps/api/src/mp/mp.module.ts`

- [ ] **Step 1: Update module**

```ts
// apps/api/src/mp/mp.module.ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ProactiveModule } from '../proactive/proactive.module';
import { TransactionsModule } from '../transactions/transactions.module';

import { MpOAuthClient } from './providers/mp-oauth-client.provider';
import { MercadoPagoProvider } from './providers/mercado-pago.provider';
import { HttpPaymentClassifier } from './providers/http-payment-classifier';
import { MpSignatureVerifier } from './providers/mp-signature-verifier';

import { StartMpConnect } from './use-cases/start-mp-connect';
import { CompleteMpConnect } from './use-cases/complete-mp-connect';
import { ProcessMpEvent } from './use-cases/process-mp-event';
import { RefreshMpToken } from '../users/use-cases/refresh-mp-token';

import { MpOAuthController } from './interface/mp-oauth.controller';
import { MpWebhookController } from './interface/mp-webhook.controller';

import { MP_PAYMENT_SOURCE } from './domain/mp-payment-source';
import { PAYMENT_CLASSIFIER } from './domain/payment-classifier';

@Module({
  imports: [UsersModule, ProactiveModule, TransactionsModule],
  controllers: [MpOAuthController, MpWebhookController],
  providers: [
    MpOAuthClient,
    StartMpConnect,
    CompleteMpConnect,
    ProcessMpEvent,
    RefreshMpToken,
    MpSignatureVerifier,
    { provide: MP_PAYMENT_SOURCE, useClass: MercadoPagoProvider },
    { provide: PAYMENT_CLASSIFIER, useClass: HttpPaymentClassifier },
  ],
})
export class MpModule {}
```

- [ ] **Step 2: Make sure `app.module.ts` ordering is right**

Open `apps/api/src/app.module.ts` and confirm `imports` order: `ConfigModule.forRoot(...)`, `DbModule`, `UsersModule`, `ProactiveModule`, `TransactionsModule`, `MpModule`.

- [ ] **Step 3: Boot test**

Run: `bun dev`
Expected: all three apps start. `apps/api` boots without errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mp/mp.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): full MP module wiring (webhook + classifier + oauth)"
```

---

## Phase 8 — apps/api: ResolveProactivePrompt + final controller wiring

### Task 8.1: ResolveProactivePrompt use-case

**Files:**
- Create: `apps/api/src/proactive/use-cases/resolve-proactive-prompt.ts`

- [ ] **Step 1: Implement**

```ts
// apps/api/src/proactive/use-cases/resolve-proactive-prompt.ts
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PENDING_PROMPTS_REPOSITORY, PendingPromptsRepository,
} from '../domain/pending-prompts.repository';
import {
  PROACTIVE_EVENT_BUS, ProactiveEventBus,
} from '../domain/proactive-event-bus';
import { AddTransaction } from '../../transactions/use-cases/add-transaction';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';
import type { ExpenseCategory } from '../../mp/domain/classification';
import type { Transaction } from '../../transactions/domain/transaction';

export type ResolveAction =
  | { action: 'add'; overrides?: { category?: ExpenseCategory; description?: string;
                                    rememberMerchantCategory?: boolean } }
  | { action: 'discard' };

@Injectable()
export class ResolveProactivePrompt {
  constructor(
    private readonly current: CurrentUserProvider,
    @Inject(PENDING_PROMPTS_REPOSITORY) private readonly prompts: PendingPromptsRepository,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
    private readonly addTx: AddTransaction,
  ) {}

  async execute(promptId: string, action: ResolveAction)
    : Promise<{ prompt: any; transaction: Transaction | null }>
  {
    const user = await this.current.get();
    const prompt = await this.prompts.getById(user.id, promptId);
    if (!prompt) throw new NotFoundException('prompt not found');
    if (prompt.intent !== 'confirm') {
      throw new BadRequestException('this prompt is not resolvable');
    }
    if (prompt.status !== 'pending') {
      return { prompt, transaction: null };          // idempotent
    }

    if (action.action === 'discard') {
      await this.prompts.markDiscarded(prompt.id);
      this.bus.publish(user.id, {
        type: 'prompt.resolved', promptId: prompt.id,
        status: 'discarded', resolvedTransactionId: null,
      });
      const fresh = await this.prompts.getById(user.id, prompt.id);
      return { prompt: fresh!, transaction: null };
    }

    const o = action.overrides ?? {};
    const tx = await this.addTx.execute({
      userId: user.id,
      date: prompt.paymentDate.toISOString().slice(0, 10),
      amount: prompt.amount,
      currency: 'ARS',
      category: o.category ?? prompt.suggestedCategory,
      description: o.description ?? prompt.suggestedDescription,
      merchant: prompt.merchant ?? 'Mercado Pago',
      direction: prompt.kind,
      status: 'active',
      source: 'mp_webhook',
      mpPaymentId: prompt.mpPaymentId,
    });
    await this.prompts.markAdded(prompt.id, tx.id);
    this.bus.publish(user.id, {
      type: 'prompt.resolved', promptId: prompt.id,
      status: 'added', resolvedTransactionId: tx.id,
    });
    const fresh = await this.prompts.getById(user.id, prompt.id);
    return { prompt: fresh!, transaction: tx };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/proactive/use-cases/resolve-proactive-prompt.ts
git commit -m "feat(api): resolve proactive prompt use-case (add/discard)"
```

### Task 8.2: Extend ProactiveController with /resolve

**Files:**
- Modify: `apps/api/src/proactive/interface/proactive.controller.ts`
- Modify: `apps/api/src/proactive/proactive.module.ts`

- [ ] **Step 1: Update controller**

```ts
// apps/api/src/proactive/interface/proactive.controller.ts
import {
  Body, Controller, Get, Inject, Param, Post, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  PROACTIVE_EVENT_BUS, ProactiveEventBus,
} from '../domain/proactive-event-bus';
import { ListPendingPrompts } from '../use-cases/list-pending-prompts';
import { ResolveProactivePrompt } from '../use-cases/resolve-proactive-prompt';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';

const ResolveSchema = z.union([
  z.object({
    action: z.literal('add'),
    overrides: z.object({
      category: z.enum(['comida','transporte','entretenimiento','salud','servicios','educacion','otros']).optional(),
      description: z.string().min(1).max(120).optional(),
      rememberMerchantCategory: z.boolean().optional(),
    }).optional(),
  }),
  z.object({ action: z.literal('discard') }),
]);

@Controller('proactive')
export class ProactiveController {
  constructor(
    private readonly list: ListPendingPrompts,
    private readonly resolve: ResolveProactivePrompt,
    private readonly current: CurrentUserProvider,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
  ) {}

  @Get('pending')
  async pending() {
    const prompts = await this.list.execute();
    return { prompts };
  }

  @Post(':id/resolve')
  async resolveOne(@Param('id') id: string, @Body() body: unknown) {
    const parsed = ResolveSchema.parse(body);
    return this.resolve.execute(id, parsed);
  }

  @Get('stream')
  async stream(@Res() res: Response) {
    const user = await this.current.get();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`: connected\n\n`);

    const unsub = this.bus.subscribe(user.id, (event) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(`: hb\n\n`), 15000);
    res.on('close', () => { clearInterval(heartbeat); unsub(); res.end(); });
  }
}
```

- [ ] **Step 2: Update module to provide ResolveProactivePrompt + import TransactionsModule**

```ts
// apps/api/src/proactive/proactive.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PENDING_PROMPTS_REPOSITORY } from './domain/pending-prompts.repository';
import { PROACTIVE_EVENT_BUS } from './domain/proactive-event-bus';
import { LibsqlPendingPromptsRepository } from './repositories/libsql-pending-prompts.repository';
import { InMemoryProactiveEventBus } from './providers/in-memory-proactive-event-bus';
import { ListPendingPrompts } from './use-cases/list-pending-prompts';
import { ResolveProactivePrompt } from './use-cases/resolve-proactive-prompt';
import { ProactiveController } from './interface/proactive.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [UsersModule, forwardRef(() => TransactionsModule)],
  controllers: [ProactiveController],
  providers: [
    { provide: PENDING_PROMPTS_REPOSITORY, useClass: LibsqlPendingPromptsRepository },
    { provide: PROACTIVE_EVENT_BUS, useClass: InMemoryProactiveEventBus },
    ListPendingPrompts,
    ResolveProactivePrompt,
  ],
  exports: [PENDING_PROMPTS_REPOSITORY, PROACTIVE_EVENT_BUS],
})
export class ProactiveModule {}
```

Also update `transactions.module.ts` to use `forwardRef(() => ProactiveModule)`:

```ts
// apps/api/src/transactions/transactions.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { ProactiveModule } from '../proactive/proactive.module';
import { TRANSACTIONS_REPOSITORY } from './domain/transactions.repository';
import { LibsqlTransactionsRepository } from './repositories/libsql-transactions.repository';
import { AddTransaction } from './use-cases/add-transaction';
import { MarkTransactionReversed } from './use-cases/mark-transaction-reversed';

@Module({
  imports: [forwardRef(() => ProactiveModule)],
  providers: [
    { provide: TRANSACTIONS_REPOSITORY, useClass: LibsqlTransactionsRepository },
    AddTransaction,
    MarkTransactionReversed,
  ],
  exports: [TRANSACTIONS_REPOSITORY, AddTransaction, MarkTransactionReversed],
})
export class TransactionsModule {}
```

- [ ] **Step 3: Boot test**

Run: `bun dev --filter=api`
Expected: clean boot. `curl http://localhost:3001/proactive/pending` → `{"prompts":[]}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/proactive/ apps/api/src/transactions/transactions.module.ts
git commit -m "feat(api): proactive controller resolve endpoint + module wiring"
```

---

## Phase 9 — apps/ui: composer chip + MP connection

### Task 9.1: useMpConnection hook

**Files:**
- Create: `apps/ui/features/proactive/useMpConnection.ts`

- [ ] **Step 1: Implement**

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

export type MpConnectionStatus =
  | { connected: false }
  | { connected: true; mpUserIdLast4: string; connectedAt: string; liveMode: boolean };

export function useMpConnection() {
  const [status, setStatus] = useState<MpConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/mp/oauth/status`, { credentials: 'include' });
      setStatus((await r.json()) as MpConnectionStatus);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = useCallback(() => {
    window.location.href = `${API}/mp/oauth/start`;
  }, []);

  const disconnect = useCallback(async () => {
    await fetch(`${API}/mp/oauth/disconnect`, { method: 'POST', credentials: 'include' });
    await refresh();
  }, [refresh]);

  return { status, loading, connect, disconnect, refresh };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/features/proactive/useMpConnection.ts
git commit -m "feat(ui): useMpConnection hook"
```

### Task 9.2: MercadoPagoChip component

**Files:**
- Create: `apps/ui/components/composer/chips/MercadoPagoChip.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useState } from 'react';
import { Wallet, X } from 'lucide-react';
import { useMpConnection } from '../../../features/proactive/useMpConnection';
import { Sparkle } from '../../icons/Sparkle';

export function MercadoPagoChip() {
  const { status, loading, connect, disconnect } = useMpConnection();
  const [open, setOpen] = useState(false);

  if (loading || status === null) return null;

  if (!status.connected) {
    return (
      <button
        onClick={connect}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill
                   bg-surface-tint border border-line-1 text-ink-2 text-sm font-medium
                   hover:shadow-e2 transition-shadow"
      >
        <span className="relative inline-flex">
          <Wallet size={16} strokeWidth={1.5} className="text-ai-ink" />
          <Sparkle size={9} className="absolute -top-1 -right-1 text-ai-violet" />
        </span>
        <span>Conectá Mercado Pago</span>
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill
                   bg-surface-tint border border-line-1 text-ink-2 text-sm font-medium
                   hover:shadow-e2 transition-shadow"
      >
        <span className="relative inline-flex items-center">
          <span className="w-1 h-1 rounded-full bg-pos mr-1.5" />
          <Wallet size={16} strokeWidth={1.5} className="text-ai-ink" />
        </span>
        <span>Mercado Pago</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-72 p-4 rounded-lg
                        bg-surface-frost backdrop-blur-md shadow-e3 border border-line-1">
          <div className="flex items-start justify-between mb-2">
            <div className="text-xs uppercase tracking-widest text-ai-ink font-semibold">
              Conexión
            </div>
            <button onClick={() => setOpen(false)} className="text-ink-3 hover:text-ink-2">
              <X size={14} />
            </button>
          </div>
          <p className="text-sm text-ink-1">
            Cuenta MP: <span className="font-mono">••••{status.mpUserIdLast4}</span>
          </p>
          <p className="text-xs text-ink-3 mt-1">
            Conectado desde {new Date(status.connectedAt).toLocaleDateString('es-AR')}
          </p>
          <p className="text-xs text-ink-3 mt-0.5">
            {status.liveMode ? 'Cuenta productiva' : 'Sandbox'}
          </p>
          <button
            onClick={async () => { await disconnect(); setOpen(false); }}
            className="mt-3 text-sm font-semibold text-ai-ink hover:underline"
          >
            Desconectar
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/components/composer/chips/MercadoPagoChip.tsx
git commit -m "feat(ui): Mercado Pago composer chip with connect/disconnect"
```

### Task 9.3: Composer + ComposerChipRow

**Files:**
- Create: `apps/ui/components/composer/Composer.tsx`
- Create: `apps/ui/components/composer/ComposerChipRow.tsx`

- [ ] **Step 1: ComposerChipRow**

```tsx
'use client';

import { MercadoPagoChip } from './chips/MercadoPagoChip';

export function ComposerChipRow() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MercadoPagoChip />
    </div>
  );
}
```

- [ ] **Step 2: Composer**

```tsx
'use client';

import { useState } from 'react';
import { Sparkle } from '../icons/Sparkle';
import { ComposerChipRow } from './ComposerChipRow';

type Props = { onSend?: (text: string) => void };

export function Composer({ onSend }: Props) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend?.(t);
    setText('');
  };

  return (
    <div className="rounded-lg bg-surface-frost backdrop-blur-md border border-line-1
                    shadow-e3 p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        }}
        placeholder="Pregúntame lo que quieras"
        rows={1}
        className="w-full resize-none bg-transparent outline-none px-2 py-1 text-ink-1
                   placeholder:text-ink-4 text-[15px]"
      />
      <div className="flex items-center justify-between mt-2">
        <ComposerChipRow />
        <button
          onClick={send}
          aria-label="Enviar"
          className="w-9 h-9 rounded-pill text-white grid place-items-center
                     shadow-brand"
          style={{ background: 'var(--brand-grad)' }}
        >
          <Sparkle size={18} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ui/components/composer/
git commit -m "feat(ui): composer with chip row (ChatGPT-style tools row)"
```

---

## Phase 10 — apps/ui: proactive cards + chat page

### Task 10.1: useProactivePrompts hook (REST + SSE)

**Files:**
- Create: `apps/ui/features/proactive/useProactivePrompts.ts`

- [ ] **Step 1: Implement**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

export type PendingPrompt = {
  id: string; userId: string; mpPaymentId: string;
  kind: 'income' | 'expense'; amount: number; merchant: string | null;
  paymentDate: string;
  suggestedCategory: 'comida'|'transporte'|'entretenimiento'|'salud'|'servicios'|'educacion'|'otros';
  suggestedDescription: string; confidence: number;
  intent: 'confirm' | 'notice';
  noticeReason: 'mp_refund' | 'mp_chargeback' | null;
  status: 'pending' | 'added' | 'discarded' | 'auto';
  resolvedTransactionId: string | null;
  createdAt: string; resolvedAt: string | null;
};

type ResolvedPayload = {
  promptId: string;
  status: PendingPrompt['status'];
  resolvedTransactionId: string | null;
};

export function useProactivePrompts() {
  const [prompts, setPrompts] = useState<PendingPrompt[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const upsert = useCallback((p: PendingPrompt) => {
    setPrompts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i === -1) return [...prev, p].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const next = prev.slice(); next[i] = p; return next;
    });
  }, []);

  const patch = useCallback((r: ResolvedPayload) => {
    setPrompts((prev) => prev.map((p) =>
      p.id === r.promptId ? { ...p, status: r.status, resolvedTransactionId: r.resolvedTransactionId } : p));
  }, []);

  const refetch = useCallback(async () => {
    const res = await fetch(`${API}/proactive/pending`, { credentials: 'include' });
    const { prompts } = await res.json();
    setPrompts(prompts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => { await refetch(); if (cancelled) return; })();
    const es = new EventSource(`${API}/proactive/stream`, { withCredentials: true });
    esRef.current = es;
    es.addEventListener('prompt.created', (e) => {
      try { const data = JSON.parse((e as MessageEvent).data); upsert(data.prompt); } catch {}
    });
    es.addEventListener('prompt.resolved', (e) => {
      try { const data = JSON.parse((e as MessageEvent).data); patch(data); } catch {}
    });
    es.onerror = () => {
      // browser will auto-reconnect; do a safety refetch on each error to catch up
      refetch().catch(() => {});
    };
    return () => { cancelled = true; es.close(); esRef.current = null; };
  }, [refetch, upsert, patch]);

  const resolve = useCallback(async (
    id: string,
    body: { action: 'add'; overrides?: any } | { action: 'discard' },
  ) => {
    const r = await fetch(`${API}/proactive/${id}/resolve`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('resolve failed');
    return r.json();
  }, []);

  return { prompts, resolve, refetch };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/features/proactive/useProactivePrompts.ts
git commit -m "feat(ui): useProactivePrompts (REST hydrate + SSE live)"
```

### Task 10.2: ProactivePromptCard (confirm intent)

**Files:**
- Create: `apps/ui/components/proactive/ProactivePromptCard.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useState } from 'react';
import { Sparkle } from '../icons/Sparkle';
import type { PendingPrompt } from '../../features/proactive/useProactivePrompts';

const CATEGORIES = ['comida','transporte','entretenimiento','salud','servicios','educacion','otros'] as const;
type Category = typeof CATEGORIES[number];

const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

type Props = {
  prompt: PendingPrompt;
  onResolve: (id: string, body: { action: 'add'; overrides?: any } | { action: 'discard' }) => Promise<any>;
};

export function ProactivePromptCard({ prompt, onResolve }: Props) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState<Category>(prompt.suggestedCategory);
  const [description, setDescription] = useState(prompt.suggestedDescription);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const locked = prompt.status !== 'pending';
  const verb = prompt.kind === 'income' ? 'cobrar' : 'pagar';
  const label = prompt.merchant ? ` a ${prompt.merchant}` : '';
  const confidenceCaption =
    prompt.confidence < 0.4 ? 'Revisalo'
    : prompt.confidence < 0.7 ? 'Categoría sugerida'
    : null;

  const handle = async (body: { action: 'add'; overrides?: any } | { action: 'discard' }) => {
    setBusy(true);
    try { await onResolve(prompt.id, body); } finally { setBusy(false); }
  };

  return (
    <article className="max-w-[540px]">
      <header className="flex items-center gap-2 mb-2">
        <Sparkle size={14} className="text-ai-violet" />
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-ai-ink font-semibold">
          Gasti
        </span>
      </header>

      <p className="text-[17px] leading-relaxed text-ink-1">
        Vi un pago de{' '}
        <span className="font-mono font-semibold">{fmtARS(prompt.amount)}</span>
        {' '}para {verb}{label} del {fmtDate(prompt.paymentDate)}.
      </p>

      <p className="mt-1 text-sm text-ink-3">
        Categoría sugerida:{' '}
        <span className={`font-medium ${prompt.confidence < 0.4 ? 'bg-warn-soft px-1.5 py-0.5 rounded' : 'text-ink-1'}`}>
          {prompt.suggestedCategory}
        </span>
        {confidenceCaption && <span className="ml-2 text-xs">{confidenceCaption}</span>}
      </p>

      {locked ? (
        <p className="mt-3 text-sm text-ink-3 italic">
          {prompt.status === 'added'    && `Agregado como ${category}`}
          {prompt.status === 'discarded' && 'Descartado'}
        </p>
      ) : editing ? (
        <div className="mt-3 space-y-2">
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full rounded-md border border-line-2 bg-surface-0 px-3 py-2 text-sm">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)}
                 className="w-full rounded-md border border-line-2 bg-surface-0 px-3 py-2 text-sm" />
          {prompt.merchant && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Recordar {prompt.merchant} como {category}
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button disabled={busy}
                    onClick={() => handle({ action: 'add', overrides: { category, description, rememberMerchantCategory: remember } })}
                    className="flex-1 rounded-md py-2 text-sm font-semibold text-white"
                    style={{ background: 'var(--brand-grad)' }}>
              Confirmar
            </button>
            <button onClick={() => setEditing(false)}
                    className="rounded-md py-2 px-3 text-sm border border-line-2">
              Atrás
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 max-w-xs">
          <button disabled={busy} onClick={() => handle({ action: 'add' })}
                  className="rounded-md py-2 px-3 bg-surface-tint border border-line-1
                             text-ai-ink text-sm font-medium hover:shadow-e2">
            Agregar
          </button>
          <button disabled={busy} onClick={() => setEditing(true)}
                  className="rounded-md py-2 px-3 bg-surface-tint border border-line-1
                             text-ai-ink text-sm font-medium hover:shadow-e2">
            Editar
          </button>
          <button disabled={busy} onClick={() => handle({ action: 'discard' })}
                  className="rounded-md py-2 px-3 bg-surface-tint border border-line-1
                             text-ai-ink text-sm font-medium hover:shadow-e2">
            Descartar
          </button>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/components/proactive/ProactivePromptCard.tsx
git commit -m "feat(ui): proactive prompt card (confirm intent)"
```

### Task 10.3: ProactiveNoticeCard (notice intent)

**Files:**
- Create: `apps/ui/components/proactive/ProactiveNoticeCard.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { Sparkle } from '../icons/Sparkle';
import type { PendingPrompt } from '../../features/proactive/useProactivePrompts';

const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

export function ProactiveNoticeCard({ prompt }: { prompt: PendingPrompt }) {
  const isChargeback = prompt.noticeReason === 'mp_chargeback';
  const body = isChargeback
    ? `Mercado Pago revirtió un pago${prompt.merchant ? ' a ' + prompt.merchant : ''} del ${fmtDate(prompt.paymentDate)} (${fmtARS(prompt.amount)}) por un contracargo.`
    : `Mercado Pago reembolsó un pago${prompt.merchant ? ' a ' + prompt.merchant : ''} del ${fmtDate(prompt.paymentDate)} (${fmtARS(prompt.amount)}). La marcamos como reembolsada.`;
  const caption = isChargeback
    ? 'Esa transacción ya no cuenta en tus totales.'
    : `Tu total de ${prompt.suggestedCategory} bajó automáticamente.`;

  return (
    <article className="max-w-[540px] rounded-lg bg-surface-tint border border-line-1 p-4">
      <header className="flex items-center gap-2 mb-2">
        <Sparkle size={14} className="text-ai-violet" />
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-ai-ink font-semibold">
          Gasti
        </span>
      </header>
      <p className="text-[15px] leading-relaxed text-ink-1">{body}</p>
      <p className="mt-1 text-xs text-ink-3">{caption}</p>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/components/proactive/ProactiveNoticeCard.tsx
git commit -m "feat(ui): proactive notice card (refund/chargeback)"
```

### Task 10.4: ChatThread + index page rewire

**Files:**
- Create: `apps/ui/components/proactive/index.tsx`
- Modify: `apps/ui/app/page.tsx`

- [ ] **Step 1: Index for proactive cards**

```tsx
'use client';

import type { PendingPrompt } from '../../features/proactive/useProactivePrompts';
import { ProactivePromptCard } from './ProactivePromptCard';
import { ProactiveNoticeCard } from './ProactiveNoticeCard';

type Props = {
  prompt: PendingPrompt;
  onResolve: (id: string, body: any) => Promise<any>;
};

export function ProactiveItem({ prompt, onResolve }: Props) {
  if (prompt.intent === 'notice') return <ProactiveNoticeCard prompt={prompt} />;
  return <ProactivePromptCard prompt={prompt} onResolve={onResolve} />;
}
```

- [ ] **Step 2: Rewire `apps/ui/app/page.tsx`**

```tsx
'use client';

import { Composer } from '../components/composer/Composer';
import { ProactiveItem } from '../components/proactive';
import { useProactivePrompts } from '../features/proactive/useProactivePrompts';

export default function Page() {
  const { prompts, resolve } = useProactivePrompts();

  return (
    <main className="min-h-screen bg-surface-1 flex flex-col">
      <header className="h-14 px-6 flex items-center border-b border-line-1 bg-surface-0">
        <span className="font-semibold text-ink-1">Gasti</span>
      </header>

      <section className="flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center">
        <div className="w-full max-w-[720px] flex flex-col gap-6">
          {prompts.length === 0 && (
            <p className="text-center text-ink-3 text-sm">
              Las novedades de Mercado Pago aparecen acá.
            </p>
          )}
          {prompts.map((p) => (
            <ProactiveItem key={p.id} prompt={p} onResolve={resolve} />
          ))}
        </div>
      </section>

      <footer className="px-6 pb-6">
        <div className="mx-auto max-w-[720px]">
          <Composer onSend={(t) => console.log('user said:', t)} />
        </div>
      </footer>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ui/components/proactive/index.tsx apps/ui/app/page.tsx
git commit -m "feat(ui): wire chat page with proactive items + composer"
```

---

## Phase 11 — Docs + verification

### Task 11.1: README setup section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a Setup section to `README.md`**

```markdown
## Setup — Proactive Mercado Pago

1. `bun install`
2. Create `apps/api/.env` from `apps/api/.env.example`. Fill in:
   - `MP_CLIENT_ID`, `MP_CLIENT_SECRET`: from the MP Developer Panel → your application.
   - `MP_WEBHOOK_SECRET`: the secret shown in your application's webhook settings.
   - `MP_REDIRECT_URI`: `<your-ngrok-url>/mp/oauth/callback`.
   - `TOKEN_ENCRYPTION_KEY`: `openssl rand -base64 32`.
3. Create `apps/ai/.env` from `apps/ai/.env.example`, fill `OPENAI_API_KEY`.
4. Start ngrok pointing at the API: `ngrok http 3001`. Copy the HTTPS URL.
5. In the MP Developer Panel:
   - Set the webhook URL to `<ngrok>/mp/webhook`, enable topic **payments**.
   - Set the redirect URI to `<ngrok>/mp/oauth/callback`.
   - (Alternative: use the MP MCP `save_webhook` tool from chat.)
6. `bun dev` — three apps come up:
   - api → http://localhost:3001
   - ai  → http://localhost:4111 (Mastra playground)
   - ui  → http://localhost:3000
7. Open `http://localhost:3000`, click the **Conectá Mercado Pago** chip below the composer.
8. Trigger a sandbox payment (use the MP MCP tools `create_test_user`, `add_money_test_user`, or the MP developer panel's payment simulator).
9. A card appears in the chat within ~5 seconds.

### Reset

`rm apps/api/data/gasti.db` and restart — migrations re-seed `users` and re-hydrate transactions from `data/transactions.json`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: setup section for proactive MP feature"
```

### Task 11.2: Walk through verification script

**Files:** none

- [ ] **Step 1: Run through Section 12 of the spec end-to-end**

For each of the 13 verification cases:
- Perform the action listed.
- Confirm the observable outcome (UI render, DB row, SSE event).
- Note any failure → file an issue / iterate.

This is the final acceptance gate. **Do not declare the feature complete until all 13 pass.**

---

## Self-review notes

Spec coverage:
- §2 amendments → recorded in spec doc and acknowledged in plan preamble.
- §3 architecture → realized across Phases 1–10.
- §4 entities/interfaces → Phase 1 (User), Phase 5 (PendingPrompt + bus), Phase 6 (Transaction), Phase 4 (Classification + interfaces).
- §5 data flow → Phase 7 ProcessMpEvent + Phase 8 ResolveProactivePrompt.
- §6 libsql storage → Phase 1 (migrations + repos), repository implementations across features.
- §7 wire formats → MP webhook DTO (Phase 4), `/proactive/*` (Phases 5+8), `/mp/oauth/*` (Phase 2).
- §8 UI surfaces → Phase 0 tokens, Phase 9 composer/chip, Phase 10 cards.
- §9 OAuth + token security → TokenCipher (Phase 1), OAuth client + use-cases (Phase 2).
- §10 SSE/bus → Phase 5.
- §11 errors/edge cases → folded into each task's branches (signature verify, ack-fast, classifier fallback, idempotency tests).
- §12 verification → Phase 11 Task 11.2 walks the same 13 cases.
