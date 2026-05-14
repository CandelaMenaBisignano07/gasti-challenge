# Gasti Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Gasti chat UI in `apps/ui` per the design spec at `docs/superpowers/specs/2026-05-14-gasti-chat-ui-design.md`, including all design-system primitives, feature components, the chat data flow with a mock repository, and full light/dark theming.

**Architecture:** Clean Architecture inside `apps/ui` with a feature-first layout (`chat/`, `transactions/`, `budgets/`, `shared/`). Each feature contains `domain/`, optional `use-cases/`, `providers/`, optional `repositories/`, `infrastructure/`, and `components/`. The Next.js `app/` directory is the thin route-segment interface. A `MockChatRepository` implements the `ChatRepository` interface for v1; swapping to a real backend later is a one-line change in `chat-context.tsx`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3, `lucide-react`, `next/font/google` (Geist, Geist Mono, Instrument Serif). No tests (per `PRODUCT.md` §Testing Decisions). Verification = `tsc --noEmit` + manual run.

**Domain skills to apply throughout:**
- `vercel-composition-patterns` — primitives never import from features; the only cross-feature seam is `<MessageAttachments>`.
- `vercel-react-best-practices` — Server Components by default; minimize `'use client'`; lift state up; pass plain props down; strict typing, no `any`.
- `web-design-guidelines` — full keyboard reach, `aria-live="polite"` log, focus ring discipline, reduced-motion guard.

**Conventions used in this plan:**
- All paths are repo-root-relative (e.g., `apps/ui/src/...`).
- `'use client'` is the **first line** of any client component file. Server Components have no directive.
- Imports use the `@/` alias mapped to `apps/ui/src/` (configured in Task 2).
- Each task ends with a typecheck and a single-subject-line commit per the repo's commit style (`docs:`, `feat:`, `chore:`).
- The verification command for most tasks is `bun --filter=ui run typecheck`, added as an npm script in Task 1.

---

## File map

A complete inventory of files this plan creates or modifies. Each task references one or more of these.

**Setup**
- Modify: `apps/ui/package.json` — add `lucide-react` dep + `typecheck` script
- Modify: `apps/ui/tsconfig.json` — add `@/*` path alias
- Create: `apps/ui/public/sparkle.svg`

**Tokens & theming**
- Modify: `apps/ui/app/globals.css` — full token set (light + dark)
- Modify: `apps/ui/tailwind.config.ts` — semantic-token theme bridge
- Modify: `apps/ui/app/layout.tsx` — font loading + no-flash script + ChatProvider wrap (in stages)

**Shared theme/icons/mesh/UI**
- Create: `apps/ui/src/shared/theme/tokens.ts`
- Create: `apps/ui/src/shared/theme/theme-provider.tsx`
- Create: `apps/ui/src/shared/icons/sparkle.tsx`
- Create: `apps/ui/src/shared/icons/category-icon.tsx`
- Create: `apps/ui/src/shared/mesh/mesh-background.tsx`
- Create: `apps/ui/src/shared/ui/card.tsx`
- Create: `apps/ui/src/shared/ui/button.tsx`
- Create: `apps/ui/src/shared/ui/pill.tsx`
- Create: `apps/ui/src/shared/ui/eyebrow.tsx`
- Create: `apps/ui/src/shared/ui/num.tsx`
- Create: `apps/ui/src/shared/ui/bar-meter.tsx`
- Create: `apps/ui/src/shared/ui/suggestion-chip.tsx`
- Create: `apps/ui/src/shared/ui/option-pill-stack.tsx`
- Create: `apps/ui/src/shared/ui/theme-toggle.tsx`

**Transactions feature**
- Create: `apps/ui/src/transactions/domain/transaction.ts`
- Create: `apps/ui/src/transactions/providers/currency-formatter.ts`
- Create: `apps/ui/src/transactions/providers/date-formatter.ts`
- Create: `apps/ui/src/transactions/components/transaction-row.tsx`
- Create: `apps/ui/src/transactions/components/transaction-list-card.tsx`

**Budgets feature**
- Create: `apps/ui/src/budgets/domain/budget-progress.ts`
- Create: `apps/ui/src/budgets/providers/budget-state.ts`
- Create: `apps/ui/src/budgets/components/budget-progress-card.tsx`

**Chat feature**
- Create: `apps/ui/src/chat/domain/message.ts`
- Create: `apps/ui/src/chat/domain/conversation.ts`
- Create: `apps/ui/src/chat/domain/chat-repository.ts`
- Create: `apps/ui/src/chat/providers/language-detector.ts`
- Create: `apps/ui/src/chat/use-cases/send-user-message.ts`
- Create: `apps/ui/src/chat/use-cases/confirm-mutation.ts`
- Create: `apps/ui/src/chat/use-cases/load-initial-conversation.ts`
- Create: `apps/ui/src/chat/repositories/mock-data.ts`
- Create: `apps/ui/src/chat/repositories/mock-chat-repository.ts`
- Create: `apps/ui/src/chat/infrastructure/chat-reducer.ts`
- Create: `apps/ui/src/chat/infrastructure/chat-context.tsx`
- Create: `apps/ui/src/chat/infrastructure/use-chat.ts`
- Create: `apps/ui/src/chat/components/composer.tsx`
- Create: `apps/ui/src/chat/components/user-message.tsx`
- Create: `apps/ui/src/chat/components/tool-call-trace.tsx`
- Create: `apps/ui/src/chat/components/message-attachments.tsx`
- Create: `apps/ui/src/chat/components/gasti-message.tsx`
- Create: `apps/ui/src/chat/components/conversation-thread.tsx`
- Create: `apps/ui/src/chat/components/landing-hero.tsx`
- Create: `apps/ui/src/chat/components/header.tsx`
- Create: `apps/ui/src/chat/components/chat-screen.tsx`

**Route wiring**
- Modify: `apps/ui/app/page.tsx`

---

## Task 1: Install `lucide-react` and add typecheck script

**Files:**
- Modify: `apps/ui/package.json`

- [ ] **Step 1: Replace `apps/ui/package.json` contents**

```json
{
  "name": "ui",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "lucide-react": "^0.460.0",
    "next": "^15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `bun install`
Expected: `lucide-react` is added to `bun.lockb`; no errors.

- [ ] **Step 3: Verify typecheck script works**

Run: `bun --filter=ui run typecheck`
Expected: exits 0 (the placeholder `page.tsx` still typechecks).

- [ ] **Step 4: Commit**

```bash
git add apps/ui/package.json bun.lockb
git commit -m "chore: add lucide-react and typecheck script to ui"
```

---

## Task 2: Add `@/*` path alias to `tsconfig.json`

**Files:**
- Modify: `apps/ui/tsconfig.json`

- [ ] **Step 1: Read current `apps/ui/tsconfig.json`**

Run: `bun --filter=ui run typecheck` first to confirm baseline still passes.

- [ ] **Step 2: Add `baseUrl` and `paths` under `compilerOptions`**

Open `apps/ui/tsconfig.json` and ensure the `compilerOptions` block includes:

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
    // ... keep all other existing compilerOptions
  }
  // ... keep include/exclude as-is
}
```

If keys already exist, merge — do not delete other options.

- [ ] **Step 3: Verify typecheck still passes**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/tsconfig.json
git commit -m "chore: add @/* path alias in ui tsconfig"
```

---

## Task 3: Add the sparkle SVG asset

**Files:**
- Create: `apps/ui/public/sparkle.svg`

- [ ] **Step 1: Create `apps/ui/public/sparkle.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="currentColor">
  <path d="M32 4 C 33 18, 34 22, 38 26 C 42 30, 46 31, 60 32 C 46 33, 42 34, 38 38 C 34 42, 33 46, 32 60 C 31 46, 30 42, 26 38 C 22 34, 18 33, 4 32 C 18 31, 22 30, 26 26 C 30 22, 31 18, 32 4 Z"/>
</svg>
```

Note: `fill="currentColor"` so the `<Sparkle>` component can recolor it via `color`/`text-*` utilities.

- [ ] **Step 2: Commit**

```bash
git add apps/ui/public/sparkle.svg
git commit -m "chore: add sparkle.svg asset"
```

---

## Task 4: Write `globals.css` with all light tokens + base classes

**Files:**
- Modify: `apps/ui/app/globals.css`

- [ ] **Step 1: Replace `apps/ui/app/globals.css` contents**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;

  /* Mesh & ambient */
  --mesh-peach:   #FFB088;
  --mesh-sunset:  #FF7A5C;
  --mesh-rose:    #F4A5C8;
  --mesh-lilac:   #B69CFF;
  --mesh-azure:   #6A8BFF;
  --mesh-indigo:  #5B4FCF;
  --mesh-ambient:
    radial-gradient(60% 55% at 12% 18%,  #FFB088 0%, rgba(255,176,136,0) 60%),
    radial-gradient(55% 50% at 92% 12%,  #FF7A5C 0%, rgba(255,122,92,0)  62%),
    radial-gradient(70% 60% at 18% 92%,  #6A8BFF 0%, rgba(106,139,255,0) 65%),
    radial-gradient(70% 70% at 88% 88%,  #B69CFF 0%, rgba(182,156,255,0) 65%),
    linear-gradient(135deg, #F4A5C8 0%, #B69CFF 50%, #6A8BFF 100%);

  /* Brand & AI */
  --brand-indigo:      #4F46E5;
  --brand-indigo-deep: #3B30C9;
  --brand-indigo-soft: #EEEBFF;
  --ai-violet:         #7C6BFF;
  --ai-violet-soft:    #F1EEFF;
  --ai-violet-ink:     #524ABF;
  --brand-grad: linear-gradient(180deg, #6E61FF 0%, #4338CA 100%);
  --brand-glow:
    0 10px 30px -10px rgba(79, 70, 229, 0.55),
    inset 0 1px 0 rgba(255,255,255,0.25);

  /* Surfaces */
  --surface-0:       #FFFFFF;
  --surface-1:       #FAFAFE;
  --surface-2:       #F4F3FA;
  --surface-3:       #ECEAF6;
  --surface-tint:    #F7F4FF;
  --surface-frost:   rgba(255,255,255,0.62);
  --surface-frost-2: rgba(255,255,255,0.42);

  /* Ink */
  --ink-1:            #0F0E17;
  --ink-2:            #3A3849;
  --ink-3:            #6E6B82;
  --ink-4:            #A09DB4;
  --ink-on-mesh:      #FFFFFF;
  --ink-on-mesh-mute: rgba(255,255,255,0.78);

  /* Lines */
  --line-1:     rgba(15, 14, 23, 0.06);
  --line-2:     rgba(15, 14, 23, 0.10);
  --line-mesh:  rgba(255, 255, 255, 0.35);
  --line-inner: rgba(255, 255, 255, 0.6);

  /* Semantic */
  --pos:       #1FA971;   --pos-soft:  #E6F7EF;
  --neg:       #E64545;   --neg-soft:  #FCEBEB;
  --warn:      #E5A03A;   --warn-soft: #FBF1DF;
  --info:      #3E6DF0;   --info-soft: #E8EEFE;

  /* Spacing */
  --s-1:  4px;  --s-2:  8px;  --s-3:  12px; --s-4:  16px; --s-5:  20px;
  --s-6:  24px; --s-7:  32px; --s-8:  40px; --s-9:  56px; --s-10: 72px;

  /* Radii */
  --r-xs:   6px;
  --r-sm:   10px;
  --r-md:   14px;
  --r-lg:   20px;
  --r-xl:   28px;
  --r-2xl:  36px;
  --r-pill: 999px;

  /* Elevation */
  --e-1: 0 1px 2px rgba(15,14,23,0.04), 0 1px 1px rgba(15,14,23,0.03);
  --e-2: 0 4px 14px -6px rgba(15,14,23,0.10), 0 2px 4px rgba(15,14,23,0.04);
  --e-3: 0 16px 40px -16px rgba(15,14,23,0.18), 0 4px 12px rgba(15,14,23,0.05);
  --e-4: 0 30px 80px -28px rgba(48,42,120,0.32), 0 8px 24px rgba(15,14,23,0.06);
  --e-glow-ai: 0 12px 36px -12px rgba(124,107,255,0.45);

  /* Blur — used via Tailwind backdrop-blur-{1,2,3} or directly */
  --blur-1: blur(8px)  saturate(120%);
  --blur-2: blur(18px) saturate(140%);
  --blur-3: blur(32px) saturate(160%);

  /* Motion */
  --dur-fast:    140ms;
  --dur-base:    260ms;
  --dur-slow:    480ms;
  --dur-ambient: 1200ms;
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.83, 0, 0.17, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Tracking */
  --tracking-tight:   -0.022em;
  --tracking-normal:  -0.005em;
  --tracking-label:    0.04em;
  --tracking-eyebrow:  0.14em;
}

::selection { background: var(--ai-violet-soft); color: var(--ai-violet-ink); }

html, body { height: 100%; }
body {
  background: var(--surface-1);
  color: var(--ink-1);
  font-family: var(--font-display), ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
  letter-spacing: var(--tracking-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.bg-mesh { background: var(--mesh-ambient); }

.num    { font-family: var(--font-mono), ui-monospace, monospace; font-weight: 500; font-feature-settings: 'tnum' 1, 'lnum' 1; color: var(--ink-1); }
.num-sm { font-size: 14px; line-height: 1.2; }
.num-md { font-size: 18px; line-height: 1.2; }
.num-lg { font-size: 28px; line-height: 1.1;  font-weight: 600; letter-spacing: var(--tracking-tight); }
.num-xl { font-size: 40px; line-height: 1.05; font-weight: 600; letter-spacing: var(--tracking-tight); }

.editorial { font-family: var(--font-editorial), serif; font-style: italic; font-weight: 400; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/globals.css
git commit -m "feat(ui): add design tokens (light) to globals.css"
```

---

## Task 5: Append dark mode overrides to `globals.css`

**Files:**
- Modify: `apps/ui/app/globals.css`

- [ ] **Step 1: Append a dark-mode block to the end of `apps/ui/app/globals.css`**

```css

/* ── Dark mode ───────────────────────────────────────────────── */
:root[data-theme="dark"] {
  --mesh-ambient:
    radial-gradient(60% 55% at 12% 18%, rgba(255,176,136,0.32) 0%, rgba(255,176,136,0) 60%),
    radial-gradient(55% 50% at 92% 12%, rgba(255,122,92,0.28)  0%, rgba(255,122,92,0)  62%),
    radial-gradient(70% 60% at 18% 92%, rgba(106,139,255,0.30) 0%, rgba(106,139,255,0) 65%),
    radial-gradient(70% 70% at 88% 88%, rgba(182,156,255,0.32) 0%, rgba(182,156,255,0) 65%),
    linear-gradient(135deg, #1B1430 0%, #181433 50%, #14132E 100%);

  --surface-0:       #1B1928;
  --surface-1:       #13111F;
  --surface-2:       #221F32;
  --surface-3:       #2A2740;
  --surface-tint:    #221A38;
  --surface-frost:   rgba(27, 25, 40, 0.55);
  --surface-frost-2: rgba(27, 25, 40, 0.40);

  --ink-1: #F5F4FB;
  --ink-2: #C9C5DC;
  --ink-3: #8F8AA8;
  --ink-4: #5C5876;

  --brand-indigo:      #6E61FF;
  --brand-indigo-deep: #4F46E5;
  --brand-indigo-soft: #2A2349;
  --ai-violet:         #9183FF;
  --ai-violet-soft:    #2A2244;
  --ai-violet-ink:     #B7ADFF;
  --brand-grad:        linear-gradient(180deg, #8A7EFF 0%, #4F46E5 100%);
  --brand-glow:
    0 10px 30px -10px rgba(110, 97, 255, 0.55),
    inset 0 1px 0 rgba(255,255,255,0.10);

  --line-1:     rgba(255, 255, 255, 0.06);
  --line-2:     rgba(255, 255, 255, 0.10);
  --line-mesh:  rgba(255, 255, 255, 0.18);
  --line-inner: rgba(255, 255, 255, 0.10);

  --pos:  #38D69E;  --pos-soft:  #1A3328;
  --neg:  #FF6B6B;  --neg-soft:  #361F23;
  --warn: #FFB95C;  --warn-soft: #2E2419;
  --info: #6E94FF;  --info-soft: #1C233E;

  --e-1: 0 1px 2px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.20);
  --e-2: 0 4px 14px -6px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.20);
  --e-3: 0 16px 40px -16px rgba(0,0,0,0.60), 0 4px 12px rgba(0,0,0,0.25);
  --e-4: 0 30px 80px -28px rgba(0,0,0,0.75), 0 8px 24px rgba(0,0,0,0.30);
  --e-glow-ai: 0 12px 36px -12px rgba(145, 131, 255, 0.55);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --mesh-ambient:
      radial-gradient(60% 55% at 12% 18%, rgba(255,176,136,0.32) 0%, rgba(255,176,136,0) 60%),
      radial-gradient(55% 50% at 92% 12%, rgba(255,122,92,0.28)  0%, rgba(255,122,92,0)  62%),
      radial-gradient(70% 60% at 18% 92%, rgba(106,139,255,0.30) 0%, rgba(106,139,255,0) 65%),
      radial-gradient(70% 70% at 88% 88%, rgba(182,156,255,0.32) 0%, rgba(182,156,255,0) 65%),
      linear-gradient(135deg, #1B1430 0%, #181433 50%, #14132E 100%);

    --surface-0:       #1B1928;
    --surface-1:       #13111F;
    --surface-2:       #221F32;
    --surface-3:       #2A2740;
    --surface-tint:    #221A38;
    --surface-frost:   rgba(27, 25, 40, 0.55);
    --surface-frost-2: rgba(27, 25, 40, 0.40);

    --ink-1: #F5F4FB;
    --ink-2: #C9C5DC;
    --ink-3: #8F8AA8;
    --ink-4: #5C5876;

    --brand-indigo:      #6E61FF;
    --brand-indigo-deep: #4F46E5;
    --brand-indigo-soft: #2A2349;
    --ai-violet:         #9183FF;
    --ai-violet-soft:    #2A2244;
    --ai-violet-ink:     #B7ADFF;
    --brand-grad:        linear-gradient(180deg, #8A7EFF 0%, #4F46E5 100%);
    --brand-glow:
      0 10px 30px -10px rgba(110, 97, 255, 0.55),
      inset 0 1px 0 rgba(255,255,255,0.10);

    --line-1:     rgba(255, 255, 255, 0.06);
    --line-2:     rgba(255, 255, 255, 0.10);
    --line-mesh:  rgba(255, 255, 255, 0.18);
    --line-inner: rgba(255, 255, 255, 0.10);

    --pos:  #38D69E;  --pos-soft:  #1A3328;
    --neg:  #FF6B6B;  --neg-soft:  #361F23;
    --warn: #FFB95C;  --warn-soft: #2E2419;
    --info: #6E94FF;  --info-soft: #1C233E;

    --e-1: 0 1px 2px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.20);
    --e-2: 0 4px 14px -6px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.20);
    --e-3: 0 16px 40px -16px rgba(0,0,0,0.60), 0 4px 12px rgba(0,0,0,0.25);
    --e-4: 0 30px 80px -28px rgba(0,0,0,0.75), 0 8px 24px rgba(0,0,0,0.30);
    --e-glow-ai: 0 12px 36px -12px rgba(145, 131, 255, 0.55);
  }
}
```

Note: the duplication is intentional and DRY-by-stylesheet — a single source-of-truth via PostCSS @apply was considered and rejected as overkill for one duplicated block.

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/globals.css
git commit -m "feat(ui): add dark-mode token overrides"
```

---

## Task 6: Bridge tokens into Tailwind via `tailwind.config.ts`

**Files:**
- Modify: `apps/ui/tailwind.config.ts`

- [ ] **Step 1: Replace `apps/ui/tailwind.config.ts` contents**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          tint: 'var(--surface-tint)',
          frost: 'var(--surface-frost)',
          'frost-2': 'var(--surface-frost-2)',
        },
        ink: {
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
          mesh: 'var(--ink-on-mesh)',
          'mesh-mute': 'var(--ink-on-mesh-mute)',
        },
        brand: {
          DEFAULT: 'var(--brand-indigo)',
          deep: 'var(--brand-indigo-deep)',
          soft: 'var(--brand-indigo-soft)',
        },
        ai: {
          DEFAULT: 'var(--ai-violet)',
          soft: 'var(--ai-violet-soft)',
          ink: 'var(--ai-violet-ink)',
        },
        pos: 'var(--pos)',
        'pos-soft': 'var(--pos-soft)',
        neg: 'var(--neg)',
        'neg-soft': 'var(--neg-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        info: 'var(--info)',
        'info-soft': 'var(--info-soft)',
        line: {
          1: 'var(--line-1)',
          2: 'var(--line-2)',
          mesh: 'var(--line-mesh)',
          inner: 'var(--line-inner)',
        },
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
        pill: 'var(--r-pill)',
      },
      spacing: {
        s1: 'var(--s-1)',
        s2: 'var(--s-2)',
        s3: 'var(--s-3)',
        s4: 'var(--s-4)',
        s5: 'var(--s-5)',
        s6: 'var(--s-6)',
        s7: 'var(--s-7)',
        s8: 'var(--s-8)',
        s9: 'var(--s-9)',
        s10: 'var(--s-10)',
      },
      boxShadow: {
        1: 'var(--e-1)',
        2: 'var(--e-2)',
        3: 'var(--e-3)',
        4: 'var(--e-4)',
        'glow-ai': 'var(--e-glow-ai)',
        'brand-glow': 'var(--brand-glow)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        editorial: ['var(--font-editorial)', 'serif'],
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        inout: 'var(--ease-in-out)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast: '140',
        base: '260',
        slow: '480',
        ambient: '1200',
      },
      backdropBlur: {
        1: '8px',
        2: '18px',
        3: '32px',
      },
      letterSpacing: {
        tight: 'var(--tracking-tight)',
        normal: 'var(--tracking-normal)',
        label: 'var(--tracking-label)',
        eyebrow: 'var(--tracking-eyebrow)',
      },
    },
  },
  plugins: [],
};

export default config;
```

Note: spacing keys are prefixed `s*` to avoid clashing with Tailwind's default numeric scale.

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/tailwind.config.ts
git commit -m "feat(ui): bridge tokens into tailwind theme"
```

---

## Task 7: Load fonts and add no-flash theme script in `layout.tsx`

**Files:**
- Modify: `apps/ui/app/layout.tsx`

- [ ] **Step 1: Replace `apps/ui/app/layout.tsx` contents**

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  variable: '--font-editorial',
  display: 'swap',
});

const noFlashScript = `try{var t=localStorage.getItem('gasti-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

export const metadata: Metadata = {
  title: 'Gasti',
  description: 'Tu asistente financiero conversacional.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/layout.tsx
git commit -m "feat(ui): load fonts and add no-flash theme script"
```

---

## Task 8: TS-level token unions in `shared/theme/tokens.ts`

**Files:**
- Create: `apps/ui/src/shared/theme/tokens.ts`

- [ ] **Step 1: Create `apps/ui/src/shared/theme/tokens.ts`**

```ts
export type NumTone = 'ink' | 'pos' | 'neg' | 'warn';
export type NumSize = 'sm' | 'md' | 'lg' | 'xl';

export type ButtonVariant = 'primary' | 'secondary' | 'frosted' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export type CardVariant = 'plain' | 'lavender' | 'frosted';
export type CardRadius = 'md' | 'lg' | 'xl';
export type CardElevation = 0 | 1 | 2 | 3;

export type Category =
  | 'comida'
  | 'transporte'
  | 'entretenimiento'
  | 'salud'
  | 'servicios'
  | 'educacion'
  | 'otros';

export type BudgetTone = 'pos' | 'warn' | 'neg';
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/theme/tokens.ts
git commit -m "feat(ui): add shared TS token unions"
```

---

## Task 9: Theme context (`shared/theme/theme-provider.tsx`)

**Files:**
- Create: `apps/ui/src/shared/theme/theme-provider.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/theme/theme-provider.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'gasti-theme';

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyPreference(pref: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', pref);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    setPreferenceState(readStoredPreference());
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyPreference(next);
    try {
      if (next === 'system') {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/theme/theme-provider.tsx
git commit -m "feat(ui): add ThemeProvider with localStorage persistence"
```

---

## Task 10: `<Sparkle>` icon component

**Files:**
- Create: `apps/ui/src/shared/icons/sparkle.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/icons/sparkle.tsx`**

```tsx
type SparkleProps = {
  size?: number;
  className?: string;
};

export function Sparkle({ size = 14, className }: SparkleProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M32 4 C 33 18, 34 22, 38 26 C 42 30, 46 31, 60 32 C 46 33, 42 34, 38 38 C 34 42, 33 46, 32 60 C 31 46, 30 42, 26 38 C 22 34, 18 33, 4 32 C 18 31, 22 30, 26 26 C 30 22, 31 18, 32 4 Z" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/icons/sparkle.tsx
git commit -m "feat(ui): add Sparkle icon component"
```

---

## Task 11: `<CategoryIcon>` component

**Files:**
- Create: `apps/ui/src/shared/icons/category-icon.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/icons/category-icon.tsx`**

```tsx
import {
  Bus,
  Clapperboard,
  GraduationCap,
  HeartPulse,
  MoreHorizontal,
  Plug,
  Tag,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '@/shared/theme/tokens';

const ICON_MAP: Record<Category, LucideIcon> = {
  comida: Utensils,
  transporte: Bus,
  entretenimiento: Clapperboard,
  salud: HeartPulse,
  servicios: Plug,
  educacion: GraduationCap,
  otros: MoreHorizontal,
};

type CategoryIconProps = {
  category: Category | string;
  size?: number;
  className?: string;
};

export function CategoryIcon({ category, size = 20, className }: CategoryIconProps) {
  const Icon = ICON_MAP[category as Category] ?? Tag;
  return <Icon size={size} strokeWidth={1.5} className={className} aria-hidden="true" />;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/icons/category-icon.tsx
git commit -m "feat(ui): add CategoryIcon component"
```

---

## Task 12: `<MeshBackground>` component

**Files:**
- Create: `apps/ui/src/shared/mesh/mesh-background.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/mesh/mesh-background.tsx`**

```tsx
type MeshBackgroundProps = {
  className?: string;
};

export function MeshBackground({ className }: MeshBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={['pointer-events-none fixed inset-0 -z-10 bg-mesh', className].filter(Boolean).join(' ')}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/mesh/mesh-background.tsx
git commit -m "feat(ui): add MeshBackground component"
```

---

## Task 13: `<Card>` primitive

**Files:**
- Create: `apps/ui/src/shared/ui/card.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/card.tsx`**

```tsx
import type { CardElevation, CardRadius, CardVariant } from '@/shared/theme/tokens';
import type { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  elevation?: CardElevation;
  radius?: CardRadius;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<CardVariant, string> = {
  plain: 'bg-surface-0 border border-line-1',
  lavender: 'bg-surface-tint border border-line-1',
  frosted: 'bg-surface-frost border border-line-mesh backdrop-blur-2',
};

const ELEVATION_CLASSES: Record<CardElevation, string> = {
  0: '',
  1: 'shadow-1',
  2: 'shadow-2',
  3: 'shadow-3',
};

const RADIUS_CLASSES: Record<CardRadius, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

export function Card({
  variant = 'plain',
  elevation,
  radius = 'lg',
  className,
  children,
  ...rest
}: CardProps) {
  const resolvedElevation: CardElevation =
    elevation ?? (variant === 'lavender' ? 0 : variant === 'frosted' ? 3 : 2);

  const frostedInnerHighlight =
    variant === 'frosted' ? 'shadow-[inset_0_1px_0_var(--line-inner)]' : '';

  return (
    <div
      className={[
        VARIANT_CLASSES[variant],
        ELEVATION_CLASSES[resolvedElevation],
        RADIUS_CLASSES[radius],
        frostedInnerHighlight,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/card.tsx
git commit -m "feat(ui): add Card primitive"
```

---

## Task 14: `<Button>` primitive

**Files:**
- Create: `apps/ui/src/shared/ui/button.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/button.tsx`**

```tsx
'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ButtonSize, ButtonVariant } from '@/shared/theme/tokens';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const BASE = [
  'inline-flex items-center justify-center gap-2',
  'rounded-pill font-display font-semibold',
  'transition-transform duration-fast ease-out',
  'active:scale-[0.985]',
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
  'disabled:opacity-30 disabled:pointer-events-none',
].join(' ');

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "text-white shadow-brand-glow [background:var(--brand-grad)]",
  secondary: 'bg-surface-0 border border-line-2 text-ink-1 hover:shadow-2',
  frosted:
    'bg-surface-frost-2 border border-line-mesh backdrop-blur-2 text-ink-1',
  ghost: 'bg-transparent text-ai-ink',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'h-11 px-s6 text-[14px] leading-none',
  sm: 'h-9  px-s5 text-[13px] leading-none',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={[BASE, VARIANT[variant], SIZE[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/button.tsx
git commit -m "feat(ui): add Button primitive"
```

---

## Task 15: `<Pill>` and `<Eyebrow>` primitives

**Files:**
- Create: `apps/ui/src/shared/ui/pill.tsx`
- Create: `apps/ui/src/shared/ui/eyebrow.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/pill.tsx`**

```tsx
import type { HTMLAttributes, ReactNode } from 'react';

type PillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'ai';
  children: ReactNode;
};

const TONE: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: 'bg-surface-tint text-ink-2 border border-line-1',
  ai: 'bg-surface-tint text-ai-ink border border-line-1',
};

export function Pill({ tone = 'neutral', className, children, ...rest }: PillProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-pill px-s3 py-[3px]',
        'font-display text-[11px] font-medium leading-none tracking-label',
        TONE[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Create `apps/ui/src/shared/ui/eyebrow.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Sparkle } from '@/shared/icons/sparkle';

type EyebrowProps = {
  tone?: 'ink' | 'ai';
  children: ReactNode;
  className?: string;
};

export function Eyebrow({ tone = 'ink', children, className }: EyebrowProps) {
  return (
    <div
      className={[
        'inline-flex items-center gap-s2',
        'font-display text-[10.5px] font-medium uppercase leading-none tracking-eyebrow',
        tone === 'ai' ? 'text-ai-ink' : 'text-ink-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tone === 'ai' && <Sparkle size={12} className="text-ai" />}
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/shared/ui/pill.tsx apps/ui/src/shared/ui/eyebrow.tsx
git commit -m "feat(ui): add Pill and Eyebrow primitives"
```

---

## Task 16: `<Num>` primitive (ARS formatter)

**Files:**
- Create: `apps/ui/src/shared/ui/num.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/num.tsx`**

```tsx
import type { NumSize, NumTone } from '@/shared/theme/tokens';

type NumProps = {
  value: number;
  size?: NumSize;
  tone?: NumTone;
  signed?: boolean;
  delta?: boolean;
  percent?: boolean;
  className?: string;
};

const SIZE_CLASS: Record<NumSize, string> = {
  sm: 'num-sm',
  md: 'num-md',
  lg: 'num-lg',
  xl: 'num-xl',
};

const TONE_CLASS: Record<NumTone, string> = {
  ink: 'text-ink-1',
  pos: 'text-pos',
  neg: 'text-neg',
  warn: 'text-warn',
};

const arsFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatValue(value: number, options: { signed: boolean; delta: boolean; percent: boolean }): string {
  const isNeg = value < 0;
  const abs = Math.abs(value);
  const body = arsFormatter.format(abs);

  if (options.percent) {
    if (options.delta) return `${isNeg ? '−' : '+'}${body}%`;
    return `${isNeg ? '−' : ''}${body}%`;
  }

  // Currency
  if (options.delta) {
    return `${isNeg ? '−' : '+'}$${body}`;
  }
  if (options.signed) {
    return `${isNeg ? '−' : ''}$${body}`;
  }
  return `$${body}`;
}

export function Num({
  value,
  size = 'md',
  tone = 'ink',
  signed = false,
  delta = false,
  percent = false,
  className,
}: NumProps) {
  const resolvedTone: NumTone =
    tone === 'ink' && (signed || delta)
      ? value < 0
        ? 'neg'
        : value > 0
        ? 'pos'
        : 'ink'
      : tone;

  return (
    <span className={['num', SIZE_CLASS[size], TONE_CLASS[resolvedTone], className].filter(Boolean).join(' ')}>
      {formatValue(value, { signed, delta, percent })}
    </span>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/num.tsx
git commit -m "feat(ui): add Num primitive with es-AR formatting"
```

---

## Task 17: `<BarMeter>` primitive

**Files:**
- Create: `apps/ui/src/shared/ui/bar-meter.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/bar-meter.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { BudgetTone } from '@/shared/theme/tokens';

type BarMeterProps = {
  value: number; // 0..1+
  tone: BudgetTone;
  animateOnMount?: boolean;
  ariaLabel?: string;
  className?: string;
};

const FILL: Record<BudgetTone, string> = {
  pos: 'bg-pos',
  warn: 'bg-warn',
  neg: 'bg-neg',
};

export function BarMeter({ value, tone, animateOnMount = true, ariaLabel, className }: BarMeterProps) {
  const target = Math.min(Math.max(value, 0), 1);
  const [displayed, setDisplayed] = useState(animateOnMount ? 0 : target);

  useEffect(() => {
    if (!animateOnMount) return;
    const id = requestAnimationFrame(() => setDisplayed(target));
    return () => cancelAnimationFrame(id);
  }, [animateOnMount, target]);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(target * 100)}
      aria-label={ariaLabel}
      className={['h-[6px] w-full rounded-pill bg-surface-3 overflow-hidden', className].filter(Boolean).join(' ')}
    >
      <div
        className={[
          'h-full rounded-pill transition-[width] duration-base ease-out',
          FILL[tone],
        ].join(' ')}
        style={{ width: `${displayed * 100}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/bar-meter.tsx
git commit -m "feat(ui): add BarMeter primitive with mount animation"
```

---

## Task 18: `<SuggestionChip>` primitive

**Files:**
- Create: `apps/ui/src/shared/ui/suggestion-chip.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/suggestion-chip.tsx`**

```tsx
'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

type SuggestionChipProps = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
};

export function SuggestionChip({ icon: Icon, label, onClick }: SuggestionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex w-full items-center gap-s3',
        'rounded-md border border-line-1 bg-surface-tint',
        'px-s4 py-s3 text-left',
        'transition-shadow duration-base ease-out hover:shadow-2',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
      ].join(' ')}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-ai-soft text-ai-ink">
        <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="flex-1 font-display text-[15px] font-medium text-ink-1">{label}</span>
      <ChevronRight size={16} strokeWidth={1.5} className="text-ink-3" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/suggestion-chip.tsx
git commit -m "feat(ui): add SuggestionChip primitive"
```

---

## Task 19: `<OptionPillStack>` primitive

**Files:**
- Create: `apps/ui/src/shared/ui/option-pill-stack.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/option-pill-stack.tsx`**

```tsx
'use client';

export type Option = {
  id: string;
  label: string;
  intent?: 'confirm' | 'cancel';
  disabled?: boolean;
};

type OptionPillStackProps = {
  options: Option[];
  onPick: (id: string) => void;
};

export function OptionPillStack({ options, onPick }: OptionPillStackProps) {
  return (
    <div role="group" className="flex flex-col gap-s2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={opt.disabled}
          onClick={() => onPick(opt.id)}
          className={[
            'w-full rounded-md border border-line-1 bg-surface-tint',
            'px-s4 py-s3 text-center font-display text-[14px] font-semibold text-ai-ink',
            'transition-transform duration-fast ease-out active:scale-[0.985]',
            'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
            'disabled:opacity-30 disabled:pointer-events-none',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/option-pill-stack.tsx
git commit -m "feat(ui): add OptionPillStack primitive"
```

---

## Task 20: `<ThemeToggle>` primitive

**Files:**
- Create: `apps/ui/src/shared/ui/theme-toggle.tsx`

- [ ] **Step 1: Create `apps/ui/src/shared/ui/theme-toggle.tsx`**

```tsx
'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/shared/theme/theme-provider';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const ICON: Record<ThemePreference, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LABEL_ES: Record<ThemePreference, string> = {
  system: 'Tema: sistema',
  light: 'Tema: claro',
  dark: 'Tema: oscuro',
};

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];

  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[preference])}
      aria-label={LABEL_ES[preference]}
      aria-pressed={preference !== 'system'}
      className={[
        'inline-flex h-11 w-11 items-center justify-center rounded-pill',
        'text-ink-2 transition-transform duration-fast ease-out active:scale-[0.985]',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
      ].join(' ')}
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/theme-toggle.tsx
git commit -m "feat(ui): add ThemeToggle"
```

---

## Task 21: Transaction domain entity

**Files:**
- Create: `apps/ui/src/transactions/domain/transaction.ts`

- [ ] **Step 1: Create `apps/ui/src/transactions/domain/transaction.ts`**

```ts
import type { Category } from '@/shared/theme/tokens';

export type Transaction = {
  id: string;
  date: string; // ISO yyyy-MM-ddTHH:mm:ss
  amount: number; // ARS; negative = expense, positive = income
  currency: 'ARS';
  category: Category | string;
  description: string;
  merchant: string;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/transactions/domain/transaction.ts
git commit -m "feat(ui): add Transaction domain type"
```

---

## Task 22: Currency and date formatters

**Files:**
- Create: `apps/ui/src/transactions/providers/currency-formatter.ts`
- Create: `apps/ui/src/transactions/providers/date-formatter.ts`

- [ ] **Step 1: Create `apps/ui/src/transactions/providers/currency-formatter.ts`**

```ts
const arsFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatArsAmount(value: number, { signed = false }: { signed?: boolean } = {}): string {
  const isNeg = value < 0;
  const body = arsFormatter.format(Math.abs(value));
  if (signed && isNeg) return `−$${body}`;
  if (signed) return `$${body}`;
  return `$${body}`;
}
```

- [ ] **Step 2: Create `apps/ui/src/transactions/providers/date-formatter.ts`**

```ts
import type { Locale } from '@/chat/domain/message';

const FMT_ES = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const FMT_EN = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function formatTransactionDate(iso: string, locale: Locale = 'es'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = locale === 'en' ? FMT_EN : FMT_ES;
  return fmt.format(d).replace('.', '').toLowerCase().replace(/^(\w)/, (m) => m);
}
```

Note: `formatTransactionDate` imports `Locale` from `@/chat/domain/message` (which will exist by the time this is exercised; the type is only referenced, not the runtime).

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: PASS once `chat/domain/message.ts` exists (Task 27). For now this task may fail typecheck — proceed and re-run after Task 27 if needed. Alternative: locally redefine `type Locale = 'es' | 'en'` to make Task 22 self-contained.

If typecheck fails on the import, replace the import with a local type definition in `date-formatter.ts`:

```ts
type Locale = 'es' | 'en';
```

Re-run typecheck.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/transactions/providers/currency-formatter.ts apps/ui/src/transactions/providers/date-formatter.ts
git commit -m "feat(ui): add ARS currency and transaction date formatters"
```

---

## Task 23: `<TransactionRow>` component

**Files:**
- Create: `apps/ui/src/transactions/components/transaction-row.tsx`

- [ ] **Step 1: Create `apps/ui/src/transactions/components/transaction-row.tsx`**

```tsx
import { CategoryIcon } from '@/shared/icons/category-icon';
import { Num } from '@/shared/ui/num';
import { formatTransactionDate } from '@/transactions/providers/date-formatter';
import type { Transaction } from '@/transactions/domain/transaction';
import type { Locale } from '@/chat/domain/message';

type TransactionRowProps = {
  transaction: Transaction;
  locale?: Locale;
};

export function TransactionRow({ transaction, locale = 'es' }: TransactionRowProps) {
  const { amount, category, merchant, date } = transaction;

  return (
    <div className="flex items-center gap-s3 px-s3 py-s3">
      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-surface-tint text-ai-ink">
        <CategoryIcon category={category} size={20} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="truncate font-display text-[15px] font-semibold text-ink-1">{merchant}</div>
        <div className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {formatTransactionDate(date, locale)}
        </div>
      </div>

      <div className="flex flex-col items-end">
        <Num value={amount} size="sm" signed />
        <span className="font-display text-[12px] font-medium tracking-label text-ink-3">
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: typecheck depends on `Locale` from `@/chat/domain/message`. If failing, mirror the workaround from Task 22 (inline `type Locale = 'es' | 'en'`).

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/transactions/components/transaction-row.tsx
git commit -m "feat(ui): add TransactionRow component"
```

---

## Task 24: `<TransactionListCard>` component

**Files:**
- Create: `apps/ui/src/transactions/components/transaction-list-card.tsx`

- [ ] **Step 1: Create `apps/ui/src/transactions/components/transaction-list-card.tsx`**

```tsx
import { Card } from '@/shared/ui/card';
import { TransactionRow } from '@/transactions/components/transaction-row';
import type { Transaction } from '@/transactions/domain/transaction';
import type { Locale } from '@/chat/domain/message';

type TransactionListCardProps = {
  items: Transaction[];
  locale?: Locale;
};

export function TransactionListCard({ items, locale = 'es' }: TransactionListCardProps) {
  return (
    <Card variant="plain" radius="lg" className="overflow-hidden">
      <ul className="divide-y divide-line-1 [&>li]:pl-[62px] [&>li:first-child]:pl-0">
        {items.map((t, i) => (
          <li key={t.id} className={i === 0 ? '' : 'relative'}>
            {/* The pl-[62px] on parent is intentionally undone for the row's left edge using a negative margin trick;
                instead we render the row natively and let the divider be visible only beneath the right column.
                Implementation: keep each row at its natural padding; render dividers as a border-top on each non-first <li>. */}
            <div className={i === 0 ? '' : 'border-t border-line-1 ml-[62px] -mr-s3'} aria-hidden />
            <TransactionRow transaction={t} locale={locale} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/transactions/components/transaction-list-card.tsx
git commit -m "feat(ui): add TransactionListCard"
```

---

## Task 25: Budget domain + state provider

**Files:**
- Create: `apps/ui/src/budgets/domain/budget-progress.ts`
- Create: `apps/ui/src/budgets/providers/budget-state.ts`

- [ ] **Step 1: Create `apps/ui/src/budgets/domain/budget-progress.ts`**

```ts
import type { Category } from '@/shared/theme/tokens';

export type BudgetProgress = {
  category: Category | string;
  budget: number;        // ARS
  spent: number;         // ARS
  projection: number;    // ARS — projected total spend by end of period
  periodLabel: string;   // e.g. "Mayo 2026"
};
```

- [ ] **Step 2: Create `apps/ui/src/budgets/providers/budget-state.ts`**

```ts
import type { BudgetTone } from '@/shared/theme/tokens';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

export function resolveBudgetTone(progress: BudgetProgress): BudgetTone {
  if (progress.budget <= 0) return 'pos';
  const ratio = progress.projection / progress.budget;
  if (ratio <= 0.85) return 'pos';
  if (ratio <= 1.0) return 'warn';
  return 'neg';
}

export function resolveBudgetFraction(progress: BudgetProgress): number {
  if (progress.budget <= 0) return 0;
  return progress.spent / progress.budget;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/budgets/domain/budget-progress.ts apps/ui/src/budgets/providers/budget-state.ts
git commit -m "feat(ui): add BudgetProgress entity and tone resolver"
```

---

## Task 26: `<BudgetProgressCard>` component

**Files:**
- Create: `apps/ui/src/budgets/components/budget-progress-card.tsx`

- [ ] **Step 1: Create `apps/ui/src/budgets/components/budget-progress-card.tsx`**

```tsx
import { Card } from '@/shared/ui/card';
import { Num } from '@/shared/ui/num';
import { BarMeter } from '@/shared/ui/bar-meter';
import { resolveBudgetFraction, resolveBudgetTone } from '@/budgets/providers/budget-state';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

type BudgetProgressCardProps = {
  progress: BudgetProgress;
  captionEs?: string; // e.g. "Proyectado: $58.000 a fin de mes"
};

export function BudgetProgressCard({ progress, captionEs }: BudgetProgressCardProps) {
  const tone = resolveBudgetTone(progress);
  const fraction = resolveBudgetFraction(progress);
  const label = progress.category.charAt(0).toUpperCase() + progress.category.slice(1);

  return (
    <Card variant="lavender" radius="lg" className="p-s4 px-s5">
      <div className="flex items-baseline justify-between">
        <div className="font-display text-[16px] font-semibold text-ink-1">{label}</div>
        <div className="flex items-baseline gap-s2">
          <Num value={progress.spent} size="sm" />
          <span className="font-display text-[12px] tracking-label text-ink-3">/</span>
          <Num value={progress.budget} size="sm" />
        </div>
      </div>
      <div className="mt-s3">
        <BarMeter value={fraction} tone={tone} ariaLabel={`Progreso de ${label}`} />
      </div>
      {captionEs && (
        <div className="mt-s2 font-display text-[12px] font-medium tracking-label text-ink-3">
          {captionEs}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/budgets/components/budget-progress-card.tsx
git commit -m "feat(ui): add BudgetProgressCard"
```

---

## Task 27: Chat domain types

**Files:**
- Create: `apps/ui/src/chat/domain/message.ts`
- Create: `apps/ui/src/chat/domain/conversation.ts`
- Create: `apps/ui/src/chat/domain/chat-repository.ts`

- [ ] **Step 1: Create `apps/ui/src/chat/domain/message.ts`**

```ts
import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

export type Locale = 'es' | 'en';

export type ToolCall = {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
};

export type OptionPill = {
  id: string;
  label: string;
  intent?: 'confirm' | 'cancel';
};

export type MessageAttachment =
  | { kind: 'transactionList'; items: Transaction[] }
  | { kind: 'budgetProgress'; progress: BudgetProgress; captionEs?: string }
  | { kind: 'optionPills'; options: OptionPill[]; resolved?: boolean };

export type UserMessage = {
  id: string;
  role: 'user';
  locale: Locale;
  text: string;
  sentAt: string;
};

export type GastiMessage = {
  id: string;
  role: 'gasti';
  locale: Locale;
  text: string;
  toolCalls?: ToolCall[];
  attachments?: MessageAttachment[];
  sentAt: string;
};

export type Message = UserMessage | GastiMessage;
```

- [ ] **Step 2: Create `apps/ui/src/chat/domain/conversation.ts`**

```ts
import type { Message } from '@/chat/domain/message';

export type Conversation = {
  id: string;
  messages: Message[];
  startedAt: string;
};
```

- [ ] **Step 3: Create `apps/ui/src/chat/domain/chat-repository.ts`**

```ts
import type { Conversation } from '@/chat/domain/conversation';
import type { GastiMessage, Locale, Message, ToolCall } from '@/chat/domain/message';

export type ReplyEvent =
  | { kind: 'thinking' }
  | { kind: 'toolCall'; call: ToolCall }
  | { kind: 'partial'; text: string }
  | { kind: 'final'; message: GastiMessage };

export interface ChatRepository {
  loadInitial(): Promise<Conversation>;
  reply(input: { text: string; locale: Locale; history: Message[] }): AsyncIterable<ReplyEvent>;
  confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent>;
}
```

- [ ] **Step 4: If Task 22 / 23 used local `Locale` workarounds, replace those local types with imports from `@/chat/domain/message`**

Open `apps/ui/src/transactions/providers/date-formatter.ts` and `apps/ui/src/transactions/components/transaction-row.tsx` and `apps/ui/src/transactions/components/transaction-list-card.tsx`. If any of them defines `type Locale = ...` locally, remove it and import:

```ts
import type { Locale } from '@/chat/domain/message';
```

- [ ] **Step 5: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/chat/domain apps/ui/src/transactions
git commit -m "feat(ui): add chat domain types and align transactions Locale import"
```

---

## Task 28: Language detector provider

**Files:**
- Create: `apps/ui/src/chat/providers/language-detector.ts`

- [ ] **Step 1: Create `apps/ui/src/chat/providers/language-detector.ts`**

```ts
import type { Locale } from '@/chat/domain/message';

const SPANISH_HINTS = [
  /\b(el|la|los|las|un|una|de|que|por|para|con|sin|sobre|entre|este|esta|esto|esos|esas)\b/i,
  /\b(cu[aá]nto|gast[eé]|gasto|gastar|cu[aá]l|c[oó]mo|cu[aá]ndo|d[oó]nde|qu[eé])\b/i,
  /\b(pes[oó]s?|hoy|ayer|ma[nñ]ana|semana|mes|a[nñ]o)\b/i,
  /\b(comida|transporte|salud|educaci[oó]n|servicios|entretenimiento|alquiler)\b/i,
  /[ñáéíóú¿¡]/,
];

export function detectLocale(text: string): Locale {
  for (const re of SPANISH_HINTS) {
    if (re.test(text)) return 'es';
  }
  return 'en';
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/providers/language-detector.ts
git commit -m "feat(ui): add language detector provider"
```

---

## Task 29: Use-cases (send / confirm / load)

**Files:**
- Create: `apps/ui/src/chat/use-cases/send-user-message.ts`
- Create: `apps/ui/src/chat/use-cases/confirm-mutation.ts`
- Create: `apps/ui/src/chat/use-cases/load-initial-conversation.ts`

- [ ] **Step 1: Create `apps/ui/src/chat/use-cases/send-user-message.ts`**

```ts
import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Locale, Message, UserMessage } from '@/chat/domain/message';

export type DispatchedEvent =
  | { kind: 'appendUser'; message: UserMessage }
  | ReplyEvent;

type Deps = {
  repo: ChatRepository;
  detectLocale: (text: string) => Locale;
  now?: () => Date;
  makeId?: () => string;
};

export function makeSendUserMessage({ repo, detectLocale, now = () => new Date(), makeId = defaultId }: Deps) {
  return async function* sendUserMessage(req: { text: string; history: Message[] }): AsyncIterable<DispatchedEvent> {
    const trimmed = req.text.trim();
    if (!trimmed) return;

    const locale = detectLocale(trimmed);
    const userMessage: UserMessage = {
      id: makeId(),
      role: 'user',
      locale,
      text: trimmed,
      sentAt: now().toISOString(),
    };
    yield { kind: 'appendUser', message: userMessage };

    for await (const ev of repo.reply({ text: trimmed, locale, history: [...req.history, userMessage] })) {
      yield ev;
    }
  };
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 2: Create `apps/ui/src/chat/use-cases/confirm-mutation.ts`**

```ts
import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Message } from '@/chat/domain/message';

type Deps = {
  repo: ChatRepository;
};

export type ConfirmEvent =
  | { kind: 'resolvePrevOptions' }
  | ReplyEvent;

export function makeConfirmMutation({ repo }: Deps) {
  return async function* confirmMutation(req: { optionId: string; history: Message[] }): AsyncIterable<ConfirmEvent> {
    yield { kind: 'resolvePrevOptions' };
    for await (const ev of repo.confirmOption({ optionId: req.optionId, history: req.history })) {
      yield ev;
    }
  };
}
```

- [ ] **Step 3: Create `apps/ui/src/chat/use-cases/load-initial-conversation.ts`**

```ts
import type { ChatRepository } from '@/chat/domain/chat-repository';
import type { Conversation } from '@/chat/domain/conversation';

type Deps = { repo: ChatRepository };

export function makeLoadInitialConversation({ repo }: Deps) {
  return function loadInitialConversation(): Promise<Conversation> {
    return repo.loadInitial();
  };
}
```

- [ ] **Step 4: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/chat/use-cases
git commit -m "feat(ui): add chat use-cases (send/confirm/load)"
```

---

## Task 30: Mock dataset constants

**Files:**
- Create: `apps/ui/src/chat/repositories/mock-data.ts`

- [ ] **Step 1: Create `apps/ui/src/chat/repositories/mock-data.ts`**

```ts
import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 't1', date: '2026-05-12T21:10:00', amount: -3400,  currency: 'ARS', category: 'comida',         description: 'Café',          merchant: 'Café Martínez' },
  { id: 't2', date: '2026-05-11T20:42:00', amount: -18900, currency: 'ARS', category: 'comida',         description: 'Pedido',        merchant: 'Rappi' },
  { id: 't3', date: '2026-05-10T13:05:00', amount: -7200,  currency: 'ARS', category: 'transporte',     description: 'Viaje',         merchant: 'Uber' },
  { id: 't4', date: '2026-05-09T19:30:00', amount: -24500, currency: 'ARS', category: 'comida',         description: 'Cena',          merchant: 'Don Julio' },
  { id: 't5', date: '2026-05-08T22:15:00', amount: -4990,  currency: 'ARS', category: 'entretenimiento',description: 'Suscripción',   merchant: 'Spotify' },
  { id: 't6', date: '2026-05-07T11:00:00', amount: -32500, currency: 'ARS', category: 'servicios',      description: 'Electricidad',  merchant: 'Edenor' },
  { id: 't7', date: '2026-05-06T18:20:00', amount: -12450, currency: 'ARS', category: 'comida',         description: 'Compras',       merchant: 'Coto' },
  { id: 't8', date: '2026-05-05T09:40:00', amount: -2300,  currency: 'ARS', category: 'transporte',     description: 'SUBE',          merchant: 'SUBE' },
  { id: 't9', date: '2026-05-04T16:55:00', amount: -8900,  currency: 'ARS', category: 'salud',          description: 'Farmacia',      merchant: 'Farmacity' },
  { id: 't10', date: '2026-05-03T20:00:00', amount: -15600,currency: 'ARS', category: 'entretenimiento',description: 'Cine x2',       merchant: 'Cinemark' },
  { id: 't11', date: '2026-05-02T12:10:00', amount: -42000,currency: 'ARS', category: 'educacion',      description: 'Curso',         merchant: 'Coderhouse' },
  { id: 't12', date: '2026-05-01T08:00:00', amount: 1500000,currency: 'ARS', category: 'otros',         description: 'Sueldo',        merchant: 'Empleador' },
];

export const MOCK_COMIDA_BUDGET: BudgetProgress = {
  category: 'comida',
  budget: 80000,
  spent: 62390, // sum of comida transactions in May
  projection: 96000,
  periodLabel: 'Mayo 2026',
};
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/repositories/mock-data.ts
git commit -m "feat(ui): add mock dataset constants"
```

---

## Task 31: `MockChatRepository`

**Files:**
- Create: `apps/ui/src/chat/repositories/mock-chat-repository.ts`

- [ ] **Step 1: Create `apps/ui/src/chat/repositories/mock-chat-repository.ts`**

```ts
import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Conversation } from '@/chat/domain/conversation';
import type { GastiMessage, Locale, Message, ToolCall } from '@/chat/domain/message';
import { MOCK_COMIDA_BUDGET, MOCK_TRANSACTIONS } from '@/chat/repositories/mock-data';

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(borr[aá]|delete).*?([uú]ltim|last)/.test(t)) return 'deleteConfirm';
  if (/com[ií]da/.test(t) && /(este\s+mes|this\s+month)/.test(t)) return 'sumComidaMonth';
  if (/(food).*?(this\s+month|month)/.test(t)) return 'sumComidaMonth';
  if (/(gast[eé]\s+m[aá]s|spent\s+most|where.*?most).*?(semana|week)/.test(t)) return 'topThisWeek';
  if (/(proyect[aá]|project).*?(mes|month)/.test(t)) return 'projectMonthEnd';
  if (/(c[oó]mo\s+voy|how\s+am\s+i\s+doing).*?(com[ií]da|food)/.test(t)) return 'budgetComida';
  return 'unknown';
}

type Intent =
  | 'sumComidaMonth'
  | 'topThisWeek'
  | 'projectMonthEnd'
  | 'budgetComida'
  | 'deleteConfirm'
  | 'unknown';

function gastiMessage(locale: Locale, text: string, opts: Partial<GastiMessage> = {}): GastiMessage {
  return {
    id: makeId(),
    role: 'gasti',
    locale,
    text,
    sentAt: new Date().toISOString(),
    ...opts,
  };
}

function toolCall(name: string, inputs: Record<string, unknown>): ToolCall {
  return { id: makeId(), name, inputs };
}

export class MockChatRepository implements ChatRepository {
  async loadInitial(): Promise<Conversation> {
    return { id: 'conv-1', messages: [], startedAt: new Date().toISOString() };
  }

  async *reply(input: { text: string; locale: Locale; history: Message[] }): AsyncIterable<ReplyEvent> {
    const intent = detectIntent(input.text);
    const { locale } = input;

    if (intent === 'deleteConfirm') {
      yield {
        kind: 'final',
        message: gastiMessage(
          locale,
          locale === 'es'
            ? '¿Querés borrar Café Martínez — $3.400 del 12 may?'
            : 'Do you want to delete Café Martínez — $3,400 from May 12?',
          {
            attachments: [
              {
                kind: 'optionPills',
                options: [
                  { id: 'confirm', label: locale === 'es' ? 'Sí, borralo' : 'Yes, delete', intent: 'confirm' },
                  { id: 'cancel', label: locale === 'es' ? 'Cancelar' : 'Cancel', intent: 'cancel' },
                ],
              },
            ],
          },
        ),
      };
      return;
    }

    yield { kind: 'thinking' };
    await delay(420);

    switch (intent) {
      case 'sumComidaMonth': {
        const call = toolCall('sumSpendByCategory', { category: 'comida', period: 'currentMonth' });
        yield { kind: 'toolCall', call };
        await delay(380);
        const comida = MOCK_TRANSACTIONS.filter((t) => t.category === 'comida' && t.amount < 0);
        const total = comida.reduce((a, t) => a + t.amount, 0);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? `Gastaste $${Math.abs(total).toLocaleString('es-AR')} en comida este mes.`
              : `You spent $${Math.abs(total).toLocaleString('es-AR')} on food this month.`,
            {
              toolCalls: [call],
              attachments: [{ kind: 'transactionList', items: comida.slice(0, 4) }],
            },
          ),
        };
        return;
      }

      case 'topThisWeek': {
        const call = toolCall('topCategoriesInRange', { from: '2026-05-06', to: '2026-05-12' });
        yield { kind: 'toolCall', call };
        await delay(360);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'Esta semana lo más fuerte fue comida ($47.700), seguido por entretenimiento ($20.590) y transporte ($9.500).'
              : 'This week the biggest line was food ($47,700), then entertainment ($20,590) and transport ($9,500).',
            { toolCalls: [call] },
          ),
        };
        return;
      }

      case 'projectMonthEnd': {
        const call = toolCall('projectMonthEnd', { asOf: new Date().toISOString().slice(0, 10) });
        yield { kind: 'toolCall', call };
        await delay(500);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'A este ritmo el mes cierra cerca de $312.000 en gastos. El número es estimativo — pocos días de muestra.'
              : 'At this pace the month closes around $312,000 in expenses. Estimate is rough — small sample so far.',
            { toolCalls: [call] },
          ),
        };
        return;
      }

      case 'budgetComida': {
        const call = toolCall('getBudgetProgress', { category: 'comida' });
        yield { kind: 'toolCall', call };
        await delay(380);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'Vas $62.390 de $80.000 en comida. Al ritmo actual proyectás $96.000 — vas a pasar el presupuesto por $16.000.'
              : 'You’re at $62,390 of $80,000 on food. At this pace you’d hit $96,000 — over by $16,000.',
            {
              toolCalls: [call],
              attachments: [
                {
                  kind: 'budgetProgress',
                  progress: MOCK_COMIDA_BUDGET,
                  captionEs:
                    locale === 'es'
                      ? 'Proyectado: $96.000 a fin de mes'
                      : 'Projected: $96,000 by month end',
                },
              ],
            },
          ),
        };
        return;
      }

      default: {
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'No entendí esa. Probá con: "¿cuánto gasté en comida este mes?" o "¿cómo voy con comida?".'
              : 'I didn’t catch that. Try: "how much did I spend on food this month?" or "how am I doing on food?".',
          ),
        };
      }
    }
  }

  async *confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    // Detect the locale from the last user message
    const lastUser = [...input.history].reverse().find((m) => m.role === 'user');
    const locale: Locale = lastUser?.locale ?? 'es';
    await delay(220);
    if (input.optionId === 'confirm') {
      yield { kind: 'final', message: gastiMessage(locale, locale === 'es' ? 'Listo. Borrada.' : 'Done. Deleted.') };
    } else {
      yield { kind: 'final', message: gastiMessage(locale, locale === 'es' ? 'Cancelado.' : 'Cancelled.') };
    }
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/repositories/mock-chat-repository.ts
git commit -m "feat(ui): add MockChatRepository with scripted intents"
```

---

## Task 32: Chat reducer

**Files:**
- Create: `apps/ui/src/chat/infrastructure/chat-reducer.ts`

- [ ] **Step 1: Create `apps/ui/src/chat/infrastructure/chat-reducer.ts`**

```ts
import type { GastiMessage, Message, MessageAttachment, ToolCall, UserMessage } from '@/chat/domain/message';

export type ChatStatus = 'idle' | 'thinking';

export type ChatState = {
  messages: Message[];
  status: ChatStatus;
};

export const initialChatState: ChatState = {
  messages: [],
  status: 'idle',
};

export type ChatAction =
  | { type: 'APPEND_USER'; message: UserMessage }
  | { type: 'SET_THINKING' }
  | { type: 'ADD_TOOL_CALL_TO_PENDING'; call: ToolCall }
  | { type: 'APPEND_GASTI'; message: GastiMessage }
  | { type: 'RESOLVE_LAST_OPTIONS' }
  | { type: 'RESET' };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'APPEND_USER':
      return { ...state, messages: [...state.messages, action.message] };

    case 'SET_THINKING':
      return { ...state, status: 'thinking' };

    case 'ADD_TOOL_CALL_TO_PENDING': {
      // Reserved for streaming; for v1 we just keep the call to attach on APPEND_GASTI.
      // No state mutation needed — the mock attaches tool calls directly to the final message.
      return state;
    }

    case 'APPEND_GASTI':
      return { messages: [...state.messages, action.message], status: 'idle' };

    case 'RESOLVE_LAST_OPTIONS': {
      const next = [...state.messages];
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i];
        if (m.role !== 'gasti' || !m.attachments) continue;
        const lastIdx = m.attachments.findIndex((a) => a.kind === 'optionPills' && !a.resolved);
        if (lastIdx === -1) continue;
        const updatedAttachments: MessageAttachment[] = m.attachments.map((a, idx) =>
          idx === lastIdx && a.kind === 'optionPills' ? { ...a, resolved: true } : a,
        );
        next[i] = { ...m, attachments: updatedAttachments };
        break;
      }
      return { ...state, messages: next };
    }

    case 'RESET':
      return initialChatState;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/infrastructure/chat-reducer.ts
git commit -m "feat(ui): add chat reducer"
```

---

## Task 33: Chat context provider + `useChat` hook

**Files:**
- Create: `apps/ui/src/chat/infrastructure/chat-context.tsx`
- Create: `apps/ui/src/chat/infrastructure/use-chat.ts`

- [ ] **Step 1: Create `apps/ui/src/chat/infrastructure/chat-context.tsx`**

```tsx
'use client';

import { createContext, useCallback, useMemo, useReducer, type ReactNode } from 'react';
import { chatReducer, initialChatState, type ChatState } from '@/chat/infrastructure/chat-reducer';
import { MockChatRepository } from '@/chat/repositories/mock-chat-repository';
import { makeSendUserMessage } from '@/chat/use-cases/send-user-message';
import { makeConfirmMutation } from '@/chat/use-cases/confirm-mutation';
import { detectLocale } from '@/chat/providers/language-detector';

export type ChatContextValue = ChatState & {
  sendMessage: (text: string) => Promise<void>;
  pickOption: (optionId: string) => Promise<void>;
};

export const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => new MockChatRepository(), []);
  const sendUserMessage = useMemo(() => makeSendUserMessage({ repo, detectLocale }), [repo]);
  const confirmMutation = useMemo(() => makeConfirmMutation({ repo }), [repo]);

  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  const sendMessage = useCallback(
    async (text: string) => {
      for await (const ev of sendUserMessage({ text, history: state.messages })) {
        switch (ev.kind) {
          case 'appendUser':
            dispatch({ type: 'APPEND_USER', message: ev.message });
            break;
          case 'thinking':
            dispatch({ type: 'SET_THINKING' });
            break;
          case 'toolCall':
            dispatch({ type: 'ADD_TOOL_CALL_TO_PENDING', call: ev.call });
            break;
          case 'partial':
            // streaming not exercised in v1
            break;
          case 'final':
            dispatch({ type: 'APPEND_GASTI', message: ev.message });
            break;
        }
      }
    },
    [sendUserMessage, state.messages],
  );

  const pickOption = useCallback(
    async (optionId: string) => {
      for await (const ev of confirmMutation({ optionId, history: state.messages })) {
        switch (ev.kind) {
          case 'resolvePrevOptions':
            dispatch({ type: 'RESOLVE_LAST_OPTIONS' });
            break;
          case 'thinking':
            dispatch({ type: 'SET_THINKING' });
            break;
          case 'toolCall':
            dispatch({ type: 'ADD_TOOL_CALL_TO_PENDING', call: ev.call });
            break;
          case 'partial':
            break;
          case 'final':
            dispatch({ type: 'APPEND_GASTI', message: ev.message });
            break;
        }
      }
    },
    [confirmMutation, state.messages],
  );

  const value = useMemo<ChatContextValue>(
    () => ({ ...state, sendMessage, pickOption }),
    [state, sendMessage, pickOption],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
```

- [ ] **Step 2: Create `apps/ui/src/chat/infrastructure/use-chat.ts`**

```ts
'use client';

import { useContext } from 'react';
import { ChatContext, type ChatContextValue } from '@/chat/infrastructure/chat-context';

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/chat/infrastructure
git commit -m "feat(ui): add ChatProvider and useChat hook"
```

---

## Task 34: `<Composer>` component

**Files:**
- Create: `apps/ui/src/chat/components/composer.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/composer.tsx`**

```tsx
'use client';

import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Sparkle } from '@/shared/icons/sparkle';

type ComposerState = 'idle' | 'thinking' | 'disabled';

type ComposerProps = {
  onSubmit: (text: string) => void;
  state?: ComposerState;
  placeholderEs?: string;
  placeholderEn?: string;
  locale?: 'es' | 'en';
};

export function Composer({
  onSubmit,
  state = 'idle',
  placeholderEs = 'Pregúntame lo que quieras',
  placeholderEn = 'Ask me anything',
  locale = 'es',
}: ComposerProps) {
  const [value, setValue] = useState('');
  const idlePlaceholder = locale === 'en' ? placeholderEn : placeholderEs;
  const thinkingPlaceholder = locale === 'en' ? 'Thinking…' : 'Buscando…';

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (state !== 'idle') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue('');
    },
    [onSubmit, state, value],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const placeholder = state === 'thinking' ? thinkingPlaceholder : idlePlaceholder;
  const disabled = state !== 'idle';
  const canSubmit = state === 'idle' && value.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className={[
        'flex items-center gap-s3 rounded-pill',
        'bg-surface-frost border border-line-mesh backdrop-blur-2',
        'px-s3 py-s2 shadow-3',
      ].join(' ')}
      aria-busy={state === 'thinking'}
    >
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={locale === 'en' ? 'Message Gasti' : 'Mensaje para Gasti'}
        className={[
          'flex-1 resize-none bg-transparent outline-none',
          'font-display text-[15px] leading-[1.5] text-ink-1 placeholder:text-ink-4',
          'max-h-32 py-s1',
        ].join(' ')}
      />
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label={locale === 'en' ? 'Send' : 'Enviar'}
        className={[
          'flex h-9 w-9 items-center justify-center rounded-pill',
          'text-white shadow-brand-glow [background:var(--brand-grad)]',
          'transition-transform duration-fast ease-out active:scale-[0.985]',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
          'disabled:opacity-30',
        ].join(' ')}
      >
        <Sparkle size={18} className={state === 'thinking' ? 'animate-pulse' : ''} />
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/composer.tsx
git commit -m "feat(ui): add Composer component"
```

---

## Task 35: `<UserMessage>` component

**Files:**
- Create: `apps/ui/src/chat/components/user-message.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/user-message.tsx`**

```tsx
import { Card } from '@/shared/ui/card';
import { Pill } from '@/shared/ui/pill';
import type { UserMessage as UserMessageEntity } from '@/chat/domain/message';

type UserMessageProps = {
  message: UserMessageEntity;
};

export function UserMessage({ message }: UserMessageProps) {
  const label = message.locale === 'en' ? 'You' : 'Vos';
  return (
    <article aria-label={label} className="flex w-full justify-end">
      <div className="flex max-w-[480px] flex-col items-end gap-s2">
        <Pill tone="ai">{label}</Pill>
        <Card variant="plain" elevation={1} radius="lg" className="px-s4 py-s3">
          <p className="whitespace-pre-wrap font-display text-[15px] leading-[1.5] text-ink-1">{message.text}</p>
        </Card>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/user-message.tsx
git commit -m "feat(ui): add UserMessage component"
```

---

## Task 36: `<ToolCallTrace>` component

**Files:**
- Create: `apps/ui/src/chat/components/tool-call-trace.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/tool-call-trace.tsx`**

```tsx
'use client';

import { Eyebrow } from '@/shared/ui/eyebrow';
import type { ToolCall } from '@/chat/domain/message';

type ToolCallTraceProps = {
  calls: ToolCall[];
};

export function ToolCallTrace({ calls }: ToolCallTraceProps) {
  if (!calls || calls.length === 0) return null;

  return (
    <details className="group mt-s3 select-none">
      <summary className="flex cursor-pointer list-none items-center gap-s3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai">
        <Eyebrow tone="ink">Tools</Eyebrow>
        <div className="flex flex-wrap gap-s2">
          {calls.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center rounded-pill border border-line-1 bg-surface-0 px-s3 py-[3px] font-mono text-[12px] text-ink-2"
            >
              {c.name}
            </span>
          ))}
        </div>
      </summary>
      <div className="mt-s3 rounded-md bg-surface-tint p-s3">
        {calls.map((c) => (
          <pre
            key={c.id}
            className="overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.4] text-ink-2"
          >{`${c.name}(${JSON.stringify(c.inputs, null, 2)})`}</pre>
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/tool-call-trace.tsx
git commit -m "feat(ui): add ToolCallTrace component"
```

---

## Task 37: `<MessageAttachments>` switch component

**Files:**
- Create: `apps/ui/src/chat/components/message-attachments.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/message-attachments.tsx`**

```tsx
'use client';

import { OptionPillStack } from '@/shared/ui/option-pill-stack';
import { TransactionListCard } from '@/transactions/components/transaction-list-card';
import { BudgetProgressCard } from '@/budgets/components/budget-progress-card';
import { useChat } from '@/chat/infrastructure/use-chat';
import type { Locale, MessageAttachment } from '@/chat/domain/message';

type MessageAttachmentsProps = {
  attachments: MessageAttachment[];
  locale: Locale;
};

export function MessageAttachments({ attachments, locale }: MessageAttachmentsProps) {
  const { pickOption } = useChat();

  return (
    <div className="mt-s3 flex flex-col gap-s3">
      {attachments.map((a, idx) => {
        if (a.kind === 'transactionList') {
          return <TransactionListCard key={idx} items={a.items} locale={locale} />;
        }
        if (a.kind === 'budgetProgress') {
          return <BudgetProgressCard key={idx} progress={a.progress} captionEs={a.captionEs} />;
        }
        if (a.kind === 'optionPills') {
          const options = a.options.map((o) => ({ ...o, disabled: a.resolved }));
          return <OptionPillStack key={idx} options={options} onPick={(id) => void pickOption(id)} />;
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/message-attachments.tsx
git commit -m "feat(ui): add MessageAttachments switch"
```

---

## Task 38: `<GastiMessage>` component

**Files:**
- Create: `apps/ui/src/chat/components/gasti-message.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/gasti-message.tsx`**

```tsx
import { Eyebrow } from '@/shared/ui/eyebrow';
import { MessageAttachments } from '@/chat/components/message-attachments';
import { ToolCallTrace } from '@/chat/components/tool-call-trace';
import type { GastiMessage as GastiMessageEntity } from '@/chat/domain/message';

type GastiMessageProps = {
  message: GastiMessageEntity;
};

export function GastiMessage({ message }: GastiMessageProps) {
  return (
    <article aria-label="Gasti" className="flex w-full">
      <div className="flex max-w-[540px] flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        <p className="whitespace-pre-wrap font-display text-[17px] leading-[1.5] text-ink-1">
          {message.text}
        </p>
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} locale={message.locale} />
        )}
        {message.toolCalls && message.toolCalls.length > 0 && <ToolCallTrace calls={message.toolCalls} />}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/gasti-message.tsx
git commit -m "feat(ui): add GastiMessage component"
```

---

## Task 39: `<ConversationThread>` component

**Files:**
- Create: `apps/ui/src/chat/components/conversation-thread.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/conversation-thread.tsx`**

```tsx
import { UserMessage } from '@/chat/components/user-message';
import { GastiMessage } from '@/chat/components/gasti-message';
import type { Message } from '@/chat/domain/message';

type ConversationThreadProps = {
  messages: Message[];
};

export function ConversationThread({ messages }: ConversationThreadProps) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      className="flex flex-col gap-s7 py-s6"
    >
      {messages.map((m) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} message={m} />
        ) : (
          <GastiMessage key={m.id} message={m} />
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/conversation-thread.tsx
git commit -m "feat(ui): add ConversationThread component"
```

---

## Task 40: `<LandingHero>` component

**Files:**
- Create: `apps/ui/src/chat/components/landing-hero.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/landing-hero.tsx`**

```tsx
'use client';

import { Coins, LineChart, Receipt, Wallet } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { SuggestionChip } from '@/shared/ui/suggestion-chip';
import { useChat } from '@/chat/infrastructure/use-chat';

const SUGGESTIONS = [
  { icon: Wallet,    label: '¿Cuánto gasté en comida este mes?' },
  { icon: Receipt,   label: 'Mostrame los gastos de los últimos 30 días.' },
  { icon: Coins,     label: '¿En qué gasté más esta semana?' },
  { icon: LineChart, label: 'Proyectá cómo termina el mes.' },
] as const;

export function LandingHero() {
  const { sendMessage } = useChat();

  return (
    <div className="flex w-full flex-col items-center gap-s7 px-s4 pt-s10">
      <Card variant="frosted" radius="xl" className="w-full max-w-[640px] px-s6 py-s8">
        <h1 className="font-display text-[44px] font-bold leading-[1.04] tracking-tight text-ink-1">
          Tu <span style={{ color: 'var(--ai-violet-ink)' }}>asistente financiero</span> conversacional.
        </h1>
        <p className="editorial mt-s4 text-[22px] leading-[1.25] text-ink-2">
          Preguntale sobre tus gastos — te responde en una oración.
        </p>
      </Card>

      <div className="flex w-full max-w-[640px] flex-col gap-s3">
        {SUGGESTIONS.map((s) => (
          <SuggestionChip
            key={s.label}
            icon={s.icon}
            label={s.label}
            onClick={() => void sendMessage(s.label)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/landing-hero.tsx
git commit -m "feat(ui): add LandingHero with suggestion chips"
```

---

## Task 41: `<Header>` component

**Files:**
- Create: `apps/ui/src/chat/components/header.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/header.tsx`**

```tsx
import { Settings } from 'lucide-react';
import { ThemeToggle } from '@/shared/ui/theme-toggle';

type HeaderProps = {
  variant?: 'frosted' | 'solid';
};

export function Header({ variant = 'solid' }: HeaderProps) {
  const surface =
    variant === 'frosted'
      ? 'bg-surface-frost border-b border-line-mesh backdrop-blur-1'
      : 'bg-surface-1 border-b border-line-1';

  return (
    <header
      className={['sticky top-0 z-10 flex h-14 items-center justify-between px-s4 sm:px-s6 lg:px-s7', surface].join(' ')}
    >
      <div className="font-display text-[18px] font-semibold tracking-tight text-ink-1">Gasti</div>
      <div className="flex items-center gap-s1">
        <ThemeToggle />
        <button
          type="button"
          aria-label="Ajustes"
          className="inline-flex h-11 w-11 items-center justify-center rounded-pill text-ink-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        >
          <Settings size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/header.tsx
git commit -m "feat(ui): add Header with ThemeToggle"
```

---

## Task 42: `<ChatScreen>` orchestrator

**Files:**
- Create: `apps/ui/src/chat/components/chat-screen.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/chat-screen.tsx`**

```tsx
'use client';

import { Composer } from '@/chat/components/composer';
import { ConversationThread } from '@/chat/components/conversation-thread';
import { Header } from '@/chat/components/header';
import { LandingHero } from '@/chat/components/landing-hero';
import { MeshBackground } from '@/shared/mesh/mesh-background';
import { useChat } from '@/chat/infrastructure/use-chat';

export function ChatScreen() {
  const { messages, status, sendMessage } = useChat();
  const isEmpty = messages.length === 0;
  const composerState = status === 'thinking' ? 'thinking' : 'idle';
  const locale = messages.length > 0
    ? messages[messages.length - 1].locale
    : (typeof navigator !== 'undefined' && navigator.language.startsWith('en') ? 'en' : 'es');

  return (
    <>
      {isEmpty && <MeshBackground />}
      <div className="relative flex min-h-screen flex-col">
        <Header variant={isEmpty ? 'frosted' : 'solid'} />

        <main className="flex-1 mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-[140px]">
          {isEmpty ? (
            <LandingHero />
          ) : (
            <ConversationThread messages={messages} />
          )}
        </main>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
          <div className="mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-s5">
            <div className="pointer-events-auto">
              <Composer
                onSubmit={(text) => void sendMessage(text)}
                state={composerState}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/chat-screen.tsx
git commit -m "feat(ui): add ChatScreen orchestrator"
```

---

## Task 43: Wire providers in `app/layout.tsx`

**Files:**
- Modify: `apps/ui/app/layout.tsx`

- [ ] **Step 1: Replace `apps/ui/app/layout.tsx` contents**

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { ThemeProvider } from '@/shared/theme/theme-provider';
import { ChatProvider } from '@/chat/infrastructure/chat-context';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  variable: '--font-editorial',
  display: 'swap',
});

const noFlashScript = `try{var t=localStorage.getItem('gasti-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

export const metadata: Metadata = {
  title: 'Gasti',
  description: 'Tu asistente financiero conversacional.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ChatProvider>{children}</ChatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/layout.tsx
git commit -m "feat(ui): wire ThemeProvider and ChatProvider into layout"
```

---

## Task 44: Render `<ChatScreen>` in `app/page.tsx`

**Files:**
- Modify: `apps/ui/app/page.tsx`

- [ ] **Step 1: Replace `apps/ui/app/page.tsx` contents**

```tsx
import { ChatScreen } from '@/chat/components/chat-screen';

export default function Page() {
  return <ChatScreen />;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/page.tsx
git commit -m "feat(ui): render ChatScreen on /"
```

---

## Task 45: Run dev server and walk through the flows

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `bun dev --filter=ui`
Expected: Next dev starts on `http://localhost:3000` without errors.

- [ ] **Step 2: Open `http://localhost:3000` and verify the landing surface**

Checklist:
- [ ] Mesh background is visible behind the hero card.
- [ ] Headline reads `Tu asistente financiero conversacional.` with "asistente financiero" colored in violet.
- [ ] One italic editorial subline below the headline.
- [ ] Four suggestion chips, each with a Lucide icon tile in soft violet and a chevron at the right.
- [ ] Composer is pinned to the bottom, frosted pill, with sparkle send button.
- [ ] Header shows "Gasti" wordmark left; theme toggle + settings icon right.

- [ ] **Step 3: Verify the chat flow**

Click the first suggestion chip ("¿Cuánto gasté en comida este mes?"):
- [ ] User bubble appears right-aligned, white, with "Vos" pill above.
- [ ] Mesh disappears; page background turns to `--surface-1`.
- [ ] Composer shows pulsing sparkle + "Buscando…" placeholder, disabled.
- [ ] After ~700ms, Gasti's reply renders with the AI eyebrow, body text, an inline transaction list (4 rows), and a "Tools" disclosure.
- [ ] Expanding "Tools" shows the JSON inputs of the `sumSpendByCategory` call in a lavender tinted box.

Type a free-form question ("borrá la última transacción") and submit:
- [ ] Confirmation card renders with two lavender pills ("Sí, borralo" / "Cancelar").
- [ ] Clicking "Sí, borralo" dims the pills, appends a new Gasti message "Listo. Borrada."

Type "how am I doing on food?":
- [ ] Gasti replies in English; the BudgetProgressCard renders with the warn-tone bar fill (orange).

- [ ] **Step 4: Verify dark mode**

Click the theme toggle in the header three times: system → light → dark → system.
- [ ] In dark mode, surfaces become deep indigo-charcoal; text becomes warm off-white; mesh is dimmed.
- [ ] No pure black anywhere; no pure white text.
- [ ] Refreshing the page in light or dark mode does NOT flash the opposite theme on first paint.

- [ ] **Step 5: Verify keyboard reach**

Tab through the page:
- [ ] Focus ring is violet, 2px outline + 2px offset (never browser blue).
- [ ] Theme toggle, settings, suggestion chips, composer, send button, and option pills are all reachable.
- [ ] `Enter` in the composer submits; `Shift+Enter` inserts a newline.

- [ ] **Step 6: Verify reduced-motion**

In OS settings or DevTools "Emulate prefers-reduced-motion: reduce":
- [ ] BarMeter does not animate from 0 on mount.
- [ ] Sparkle send button does not pulse.

- [ ] **Step 7: Run the production build**

Stop the dev server. Run: `bun run build --filter=ui`
Expected: build succeeds with no TypeScript errors and produces a production output.

- [ ] **Step 8: Final commit (only if you made any fixes during verification)**

```bash
git status
# If any files changed, commit them with a focused subject:
git add -- <files>
git commit -m "fix(ui): <what was fixed>"
```

If no files changed, this step is a no-op.

---

## Self-Review

**1. Spec coverage check** (against `docs/superpowers/specs/2026-05-14-gasti-chat-ui-design.md`):

- §1 Goal/non-goals → embedded in plan header and scope.
- §2 Clean Architecture layout → Tasks 8, 21–32 (every folder created).
- §3 Tokens / Tailwind / fonts / sparkle → Tasks 1, 3, 4, 5, 6, 7.
- §4 Component inventory → Tasks 8–42 (every component listed in the spec has a task).
- §5 Chat data flow → Tasks 27 (domain), 28 (provider), 29 (use-cases), 30–31 (mock repo), 32–33 (infra).
- §6 Dark mode → Tasks 5 (tokens), 7 (no-flash script), 9 (provider), 20 (toggle), 41 (header placement).
- §7 Screen states + responsive → Task 42 (ChatScreen logic), Task 45 Step 2/3 (manual verification).
- §8 Accessibility → Tasks 17 (BarMeter `role=progressbar`), 35 (UserMessage `<article aria-label>`), 38 (GastiMessage `<article aria-label>`), 39 (ConversationThread `role=log aria-live`), 41 (header buttons aria-label), 45 Step 5 (keyboard verification).
- §9 Error handling → Task 33 (`useChat` throws outside provider), Task 34 (empty-input no-op), Task 9 (try/catch on localStorage).
- §10 Out of scope → respected; no tests, no auth, no separate routes.
- §11 Definition of done → covered by Task 45.

**2. Placeholder scan:** No `TBD`/`TODO`/"fill in"/"similar to" left in the plan. Each code block is complete.

**3. Type consistency:** Function names match across tasks (`makeSendUserMessage`, `makeConfirmMutation`, `makeLoadInitialConversation`, `chatReducer`, `ChatContext`, `ChatProvider`, `useChat`, `MockChatRepository`). Event kinds (`appendUser`, `thinking`, `toolCall`, `partial`, `final`, `resolvePrevOptions`) match between use-cases and reducer dispatch. Property names (`messages`, `status`, `attachments`, `toolCalls`, `sentAt`, `locale`, `intent`, `resolved`) are consistent across domain types, mock repo, components.

**4. Forward-reference fix:** Task 22 imports `Locale` from `@/chat/domain/message` before Task 27 creates it. Mitigation is explicit in Task 22 Step 3 and Task 27 Step 4 (local-type workaround, then alignment).

---

## Notes for the engineer

- **Fixing imports as features land:** Tasks 22–24 may show `Locale` import errors until Task 27 is complete. This is intentional and documented; do not skip those tasks — typecheck failures during the early tasks are isolated to the import line and resolve at Task 27 Step 4. If you prefer a linear green build, use the local `type Locale = 'es' | 'en'` workaround that Task 22 calls out.
- **`s*` spacing utilities:** the Tailwind theme uses `s1`–`s10` to avoid colliding with Tailwind's default numeric scale. Use `px-s4`, `gap-s3`, etc. — not `px-4`.
- **Server vs Client:** Server Components by default. The files that begin with `'use client'` are: `button.tsx`, `bar-meter.tsx`, `suggestion-chip.tsx`, `option-pill-stack.tsx`, `theme-toggle.tsx`, `theme-provider.tsx`, `composer.tsx`, `tool-call-trace.tsx`, `message-attachments.tsx`, `landing-hero.tsx`, `chat-screen.tsx`, `chat-context.tsx`, `use-chat.ts`. Everything else is universal.
- **No tests:** per `PRODUCT.md` §Testing Decisions. Verification is `tsc --noEmit` + `bun run build --filter=ui` + the manual flow checklist in Task 45.
