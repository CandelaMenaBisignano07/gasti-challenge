# Gasti Chat UI Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure-CSS motion layer to the Gasti chat UI — message entrance, interactive feedback, disclosure expansion, thinking states, and ambient polish.

**Architecture:** All animation is CSS keyframes + Tailwind utilities. No animation library. `prefers-reduced-motion: reduce` eliminates all motion via the existing global media query in `globals.css`; only `BarMeter` needs an extra JS guard because its fill is state-driven.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 3, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-16-gasti-chat-animations-design.md`

**Verification:** This project has no test suite (per `PRODUCT.md`). The gate for every task is `bun --filter=ui run typecheck` (run from the worktree root). The final task also runs the production build.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/ui/tailwind.config.ts` | Fix `transitionDuration` units; add `animation` utilities |
| `apps/ui/app/globals.css` | Add `@keyframes` definitions |
| `apps/ui/src/chat/components/user-message.tsx` | Entrance animation on root |
| `apps/ui/src/chat/components/gasti-message.tsx` | Entrance animation on root |
| `apps/ui/src/shared/ui/bar-meter.tsx` | Reduced-motion JS guard |
| `apps/ui/src/chat/components/composer.tsx` | Sparkle thinking-pulse |
| `apps/ui/src/chat/components/tool-call-trace.tsx` | Controlled disclosure + expand animation |
| `apps/ui/src/chat/components/thinking-indicator.tsx` | **New** — in-thread thinking indicator |
| `apps/ui/src/chat/components/conversation-thread.tsx` | `pending` prop; render indicator |
| `apps/ui/src/shared/mesh/mesh-background.tsx` | Drift animation; `visible` prop |
| `apps/ui/src/chat/components/chat-screen.tsx` | Always-mount mesh; pass `pending`/`visible` |
| `apps/ui/src/shared/ui/option-pill-stack.tsx` | Resolve-fade transition |
| `apps/ui/src/shared/ui/suggestion-chip.tsx` | Hover elevation lift |
| `DESIGN.md` | Motion section amendment |

---

## Task 1: Foundation — fix duration tokens, add animation utilities and keyframes

**Files:**
- Modify: `apps/ui/tailwind.config.ts`
- Modify: `apps/ui/app/globals.css`

- [ ] **Step 1: Fix the unitless `transitionDuration` values in `apps/ui/tailwind.config.ts`**

Replace the `transitionDuration` block (currently lines 90-95):

```ts
      transitionDuration: {
        fast:    '140ms',
        base:    '260ms',
        slow:    '480ms',
        ambient: '1200ms',
      },
```

- [ ] **Step 2: Add an `animation` block in `apps/ui/tailwind.config.ts`**

Immediately after the `transitionDuration` block from Step 1 (still inside `theme.extend`), add:

```ts
      animation: {
        'message-enter': 'message-enter 320ms var(--ease-spring) both',
        'sparkle-pulse': 'sparkle-pulse 1200ms var(--ease-spring) infinite',
        'thinking-dot':  'thinking-dot 1000ms var(--ease-in-out) infinite',
        'mesh-drift':    'mesh-drift 28s var(--ease-in-out) infinite',
      },
```

- [ ] **Step 3: Add the `@keyframes` to `apps/ui/app/globals.css`**

Immediately after the `.editorial { ... }` rule (currently line 124) and before the `@media (prefers-reduced-motion: reduce)` block, add:

```css
/* ── Motion keyframes ────────────────────────────────────────── */
@keyframes message-enter {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes sparkle-pulse {
  0%, 100% { transform: scale(1);    opacity: 1;   }
  50%      { transform: scale(1.12); opacity: 0.7; }
}

@keyframes thinking-dot {
  0%, 100% { opacity: 1;   transform: translateY(0);    }
  50%      { opacity: 0.3; transform: translateY(-2px); }
}

@keyframes mesh-drift {
  0%, 100% { transform: translate3d(0, 0, 0);      }
  50%      { transform: translate3d(-2%, 1.5%, 0); }
}
```

- [ ] **Step 4: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/tailwind.config.ts apps/ui/app/globals.css
git commit -m "fix(ui): fix duration tokens, add animation utilities and keyframes"
```

---

## Task 2: Message entrance animation

**Files:**
- Modify: `apps/ui/src/chat/components/user-message.tsx`
- Modify: `apps/ui/src/chat/components/gasti-message.tsx`

- [ ] **Step 1: Add `animate-message-enter` to the `<article>` in `apps/ui/src/chat/components/user-message.tsx`**

Change the `<article>` line from:

```tsx
    <article aria-label={label} className="flex w-full justify-end">
```

to:

```tsx
    <article aria-label={label} className="flex w-full justify-end animate-message-enter">
```

- [ ] **Step 2: Add `animate-message-enter` to the `<article>` in `apps/ui/src/chat/components/gasti-message.tsx`**

Change the `<article>` line from:

```tsx
    <article aria-label="Gasti" className="flex w-full">
```

to:

```tsx
    <article aria-label="Gasti" className="flex w-full animate-message-enter">
```

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/chat/components/user-message.tsx apps/ui/src/chat/components/gasti-message.tsx
git commit -m "feat(ui): animate chat message entrance"
```

---

## Task 3: BarMeter reduced-motion guard

**Files:**
- Modify: `apps/ui/src/shared/ui/bar-meter.tsx`

- [ ] **Step 1: Replace the `useEffect` in `apps/ui/src/shared/ui/bar-meter.tsx`**

Replace the existing effect (currently lines 24-28):

```tsx
  useEffect(() => {
    if (!animateOnMount) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplayed(target);
      return;
    }
    const id = requestAnimationFrame(() => setDisplayed(target));
    return () => cancelAnimationFrame(id);
  }, [animateOnMount, target]);
```

This keeps the server and client first render identical (`displayed` starts at `0`), then corrects on mount. Under reduced motion the value jumps straight to `target` with no `requestAnimationFrame` deferral; the CSS `transition-[width]` is already neutralized by the global reduced-motion block.

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/bar-meter.tsx
git commit -m "fix(ui): skip BarMeter fill animation under reduced motion"
```

---

## Task 4: Sparkle thinking-pulse

**Files:**
- Modify: `apps/ui/src/chat/components/composer.tsx`

- [ ] **Step 1: Swap the sparkle animation class in `apps/ui/src/chat/components/composer.tsx`**

Change the `<Sparkle>` line from:

```tsx
        <Sparkle size={18} className={state === 'thinking' ? 'animate-pulse' : ''} />
```

to:

```tsx
        <Sparkle size={18} className={state === 'thinking' ? 'animate-sparkle-pulse' : ''} />
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/components/composer.tsx
git commit -m "feat(ui): use spring sparkle-pulse for composer thinking state"
```

---

## Task 5: Tool-call disclosure expand animation

**Files:**
- Modify: `apps/ui/src/chat/components/tool-call-trace.tsx`

- [ ] **Step 1: Replace the full contents of `apps/ui/src/chat/components/tool-call-trace.tsx`**

The native `<details>` element cannot animate its open/close (`display: none`). Convert it to a controlled disclosure (a `<button>` with `aria-expanded`/`aria-controls` plus an animated region) and animate the panel with the `grid-template-rows: 0fr → 1fr` technique.

```tsx
'use client';

import { useId, useState } from 'react';
import { Eyebrow } from '@/shared/ui/eyebrow';
import type { ToolCall } from '@/chat/domain/message';

type ToolCallTraceProps = {
  calls: ToolCall[];
};

export function ToolCallTrace({ calls }: ToolCallTraceProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (calls.length === 0) return null;

  return (
    <div className="mt-s3 select-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-s3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      >
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
      </button>

      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-slow ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={[
              'mt-s3 rounded-md bg-surface-tint p-s3',
              'transition-opacity duration-slow ease-out',
              open ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            {calls.map((c) => (
              <pre
                key={c.id}
                className="overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.4] text-ink-2"
              >{`${c.name}(${JSON.stringify(c.inputs, null, 2)})`}</pre>
            ))}
          </div>
        </div>
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
git add apps/ui/src/chat/components/tool-call-trace.tsx
git commit -m "feat(ui): animate tool-call disclosure expand"
```

---

## Task 6: ThinkingIndicator component

**Files:**
- Create: `apps/ui/src/chat/components/thinking-indicator.tsx`

- [ ] **Step 1: Create `apps/ui/src/chat/components/thinking-indicator.tsx`**

```tsx
import { Eyebrow } from '@/shared/ui/eyebrow';

const DOT_DELAYS = [0, 150, 300];

export function ThinkingIndicator() {
  return (
    <article aria-label="Gasti está pensando" className="flex w-full animate-message-enter">
      <div className="flex flex-col gap-s2">
        <Eyebrow tone="ai">Gasti</Eyebrow>
        <div className="flex items-center gap-s2" aria-hidden="true">
          {DOT_DELAYS.map((delay) => (
            <span
              key={delay}
              className="h-[7px] w-[7px] rounded-pill bg-ai-ink animate-thinking-dot"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
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
git add apps/ui/src/chat/components/thinking-indicator.tsx
git commit -m "feat(ui): add in-thread ThinkingIndicator component"
```

---

## Task 7: Render ThinkingIndicator in ConversationThread

**Files:**
- Modify: `apps/ui/src/chat/components/conversation-thread.tsx`

- [ ] **Step 1: Replace the full contents of `apps/ui/src/chat/components/conversation-thread.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { UserMessage } from '@/chat/components/user-message';
import { GastiMessage } from '@/chat/components/gasti-message';
import { ThinkingIndicator } from '@/chat/components/thinking-indicator';
import type { Message } from '@/chat/domain/message';

type ConversationThreadProps = {
  messages: Message[];
  pending?: boolean;
};

export function ConversationThread({ messages, pending = false }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

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
      {pending && <ThinkingIndicator />}
      <div ref={bottomRef} aria-hidden="true" />
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
git commit -m "feat(ui): render ThinkingIndicator while Gasti replies"
```

---

## Task 8: Mesh drift and landing→chat crossfade

**Files:**
- Modify: `apps/ui/src/shared/mesh/mesh-background.tsx`
- Modify: `apps/ui/src/chat/components/chat-screen.tsx`

- [ ] **Step 1: Replace the full contents of `apps/ui/src/shared/mesh/mesh-background.tsx`**

```tsx
type MeshBackgroundProps = {
  className?: string;
  visible?: boolean;
};

export function MeshBackground({ className, visible = true }: MeshBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none fixed inset-0 -z-10 bg-mesh animate-mesh-drift',
        'transition-opacity duration-base ease-out',
        visible ? 'opacity-100' : 'opacity-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
```

- [ ] **Step 2: Replace the full contents of `apps/ui/src/chat/components/chat-screen.tsx`**

`MeshBackground` is now always mounted (so it can crossfade), and `ConversationThread` receives `pending`.

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

  return (
    <>
      <MeshBackground visible={isEmpty} />
      <div className="relative flex min-h-screen flex-col">
        <Header variant={isEmpty ? 'frosted' : 'solid'} />

        <main className="flex-1 mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-[140px]">
          {isEmpty ? (
            <LandingHero />
          ) : (
            <ConversationThread messages={messages} pending={status === 'thinking'} />
          )}
        </main>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
          <div className="mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-s5">
            <div className="pointer-events-auto">
              <Composer
                onSubmit={(text) => void sendMessage(text)}
                state={composerState}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/shared/mesh/mesh-background.tsx apps/ui/src/chat/components/chat-screen.tsx
git commit -m "feat(ui): add mesh drift and landing-to-chat crossfade"
```

---

## Task 9: Option-pill resolve fade

**Files:**
- Modify: `apps/ui/src/shared/ui/option-pill-stack.tsx`

- [ ] **Step 1: Update the `<button>` in `apps/ui/src/shared/ui/option-pill-stack.tsx`**

The press scale (140ms) and the resolve opacity fade (260ms) need different durations on the same element, so the transition is set with an inline `style` shorthand instead of Tailwind duration classes. Replace the `<button>` element (currently lines 19-35):

```tsx
        <button
          key={opt.id}
          type="button"
          disabled={opt.disabled}
          onClick={() => onPick(opt.id)}
          style={{
            transition:
              'transform var(--dur-fast) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
          }}
          className={[
            'w-full rounded-md border border-line-1 bg-surface-tint',
            'px-s4 py-s3 text-center font-display text-[14px] font-semibold text-ai-ink',
            'active:scale-[0.985]',
            'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai',
            'disabled:opacity-30 disabled:pointer-events-none',
          ].join(' ')}
        >
          {opt.label}
        </button>
```

The `transition-transform duration-fast ease-out` classes are removed; the inline `style` replaces them. The global reduced-motion block uses `!important`, which overrides this inline transition, so reduced motion still disables it.

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/option-pill-stack.tsx
git commit -m "feat(ui): fade option pills when they resolve"
```

---

## Task 10: Suggestion-chip hover elevation

**Files:**
- Modify: `apps/ui/src/shared/ui/suggestion-chip.tsx`

- [ ] **Step 1: Update the chip's shadow classes in `apps/ui/src/shared/ui/suggestion-chip.tsx`**

`DESIGN.md` specifies hover lifts elevation `e-2 → e-3`. The chip currently has no resting shadow and lifts only to `e-2`. Change the class line from:

```tsx
        'transition-shadow duration-base ease-out hover:shadow-2',
```

to:

```tsx
        'shadow-2 transition-shadow duration-base ease-out hover:shadow-3',
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/shared/ui/suggestion-chip.tsx
git commit -m "fix(ui): lift suggestion chip elevation e-2 to e-3 on hover"
```

---

## Task 11: DESIGN.md motion amendment

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Amend the Motion section of `DESIGN.md`**

In the bullet list under `### Motion (slow, confident, premium)`, change the line:

```
- `--ease-spring` is allowed **only** on the AI sparkle pulse. Buttons do not bounce.
```

to:

```
- `--ease-spring` is allowed on the AI sparkle pulse and on message entrance. Buttons do not bounce.
- **Message entrance:** new chat messages fade in and rise 10px — **320ms** with `--ease-spring`.
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs: allow spring easing on message entrance in DESIGN.md"
```

---

## Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole UI workspace**

Run: `bun --filter=ui run typecheck`
Expected: exits 0.

- [ ] **Step 2: Production build**

Run: `bun run build --filter=ui`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual walkthrough — normal motion**

Run `bun dev --filter=ui`, open `http://localhost:3000`:
- [ ] Sending a message animates it in with a gentle spring rise (fade + 10px).
- [ ] While Gasti replies, a "Gasti" eyebrow + three pulsing dots appear in the thread.
- [ ] Clicking "Tools" expands the tool-call panel smoothly (~480ms).
- [ ] Button / option-pill presses scale down slightly.
- [ ] The budget BarMeter fills from 0 to its value.
- [ ] The composer sparkle pulses while thinking.
- [ ] The mesh background drifts slowly and fades out when the first message is sent.
- [ ] Option pills fade to dimmed when resolved.

- [ ] **Step 4: Manual walkthrough — reduced motion**

In DevTools, emulate `prefers-reduced-motion: reduce`, reload:
- [ ] No motion anywhere — messages, indicator, disclosure, BarMeter, sparkle, mesh all render directly in their final state.

- [ ] **Step 5: Final commit (only if fixes were made during verification)**

```bash
git status
# If any files changed:
git add -- <files>
git commit -m "fix(ui): <what was fixed>"
```

If nothing changed, this step is a no-op.

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-05-16-gasti-chat-animations-design.md`):
- §2.1 duration tokens → Task 1. §2.2 keyframes → Task 1. §2.3 animation utilities → Task 1. §2.4 reduced motion → existing block (Task 1) + Task 3.
- §3 message entrance → Task 2.
- §4 press/hover → press works after Task 1; hover → Task 10.
- §5 BarMeter → Task 3.
- §6 tool-call disclosure → Task 5.
- §7.1 sparkle pulse → Task 4. §7.2 thinking indicator → Tasks 6 + 7 (+ 8 passes `pending`).
- §8.1 mesh drift → Task 8. §8.2 crossfade → Task 8. §8.3 pill resolve → Task 9.
- §9 DESIGN.md → Task 11.
- §11 verification → Task 12.

**2. Placeholder scan:** No `TBD`/`TODO`/"similar to". Every code step shows complete code.

**3. Type consistency:** `MeshBackground` gains `visible?: boolean` (Task 8 step 1) and is consumed as `visible={isEmpty}` (Task 8 step 2). `ConversationThread` gains `pending?: boolean` (Task 7) and is consumed as `pending={status === 'thinking'}` (Task 8). `ThinkingIndicator` is exported as a named export (Task 6) and imported by `ConversationThread` (Task 7). Animation utility names (`message-enter`, `sparkle-pulse`, `thinking-dot`, `mesh-drift`) match between the Tailwind `animation` keys (Task 1), the `globals.css` keyframes (Task 1), and the `animate-*` classes used in Tasks 2, 4, 6, 8.
