# Gasti Chat UI — Animations Design

**Date:** 2026-05-16
**Status:** Approved (brainstorming)
**Scope:** `apps/ui` — motion layer for the chat UI
**Depends on:** the chat UI implemented on branch `worktree-feat-chat-ui`

---

## 1. Goal

Add a deliberate motion layer to the Gasti chat UI: message entrance, interactive
feedback, disclosure expansion, thinking states, and ambient polish. Motion is
**"slightly more expressive"** than the current `DESIGN.md` baseline — a gentle
spring on message entrance — while staying calm everywhere else.

### Non-goals

- No animation library. Pure CSS / Tailwind keyframes only.
- No exit/removal animations for messages (the thread is append-only).
- No new chat behavior — this is presentation only.

### Decisions taken during brainstorming

- **Character:** slightly more expressive — a gentle spring (`--ease-spring`) on
  message entrance. `DESIGN.md`'s Motion section is amended to permit it. Buttons
  stay non-bouncing.
- **Scope:** Core + ambient polish (all surfaces below).
- **Approach:** pure CSS keyframes (Approach A).
- **Reduced motion:** when `prefers-reduced-motion: reduce` is set, animations are
  **fully eliminated** — every element renders directly in its final state.

---

## 2. Foundation

### 2.1 Fix the broken duration tokens

`apps/ui/tailwind.config.ts` declares `transitionDuration` with **unitless** values
(`fast: '140'`, `base: '260'`, `slow: '480'`, `ambient: '1200'`). Unitless duration
is invalid CSS, so every `duration-fast` / `duration-base` / `duration-slow` class
in the codebase is currently a **no-op** — presses snap, the BarMeter jumps.

Fix: add the `ms` unit.

```ts
transitionDuration: {
  fast:    '140ms',
  base:    '260ms',
  slow:    '480ms',
  ambient: '1200ms',
},
```

This single change activates all already-coded transitions (button press, option
pill press, theme-toggle press, composer-send press, suggestion-chip hover,
BarMeter fill).

### 2.2 Keyframes

All keyframes are defined so that **`0%`/`100%` equal the element's rest state**.
This makes reduced-motion correct for free: the global media query (§2.4) forces
`animation-iteration-count: 1` and a near-zero duration, so each animation settles
on its `100%` frame — which is the rest state.

Add to `apps/ui/app/globals.css`:

```css
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

### 2.3 Tailwind animation utilities

Add to `theme.extend` in `apps/ui/tailwind.config.ts`. Easing references the CSS
variables already defined on `:root` in `globals.css`.

```ts
animation: {
  'message-enter': 'message-enter 320ms var(--ease-spring) both',
  'sparkle-pulse': 'sparkle-pulse 1200ms var(--ease-spring) infinite',
  'thinking-dot':  'thinking-dot 1000ms var(--ease-in-out) infinite',
  'mesh-drift':    'mesh-drift 28s var(--ease-in-out) infinite',
},
```

The `keyframes` are declared in `globals.css` (§2.2), so no `keyframes` block is
needed in the Tailwind config — the `animation` shorthand references them by name.

### 2.4 Reduced motion

`apps/ui/app/globals.css` already contains:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

This block stays as-is and is sufficient for every CSS animation/transition in
this spec — see §2.2 for why the keyframes are reduced-motion-safe. The **only**
component that also needs a JS guard is `BarMeter` (§5), because its fill is
driven by a React state transition rather than a keyframe.

---

## 3. Message entrance

The headline feature.

- **Keyframe:** `message-enter` — `opacity 0→1`, `translateY(10px)→0`.
- **Timing:** `320ms`, `--ease-spring`, `both` fill. The spring's gentle overshoot
  is the "slightly expressive" character. `both` applies the `from` state before
  the first frame so there is no flash of the un-animated element.
- **Where:** the `animate-message-enter` class is applied to the **root element**
  of `UserMessage` (`<article>`) and `GastiMessage` (`<article>`).
- **Behavior:** runs once on mount. Because `ConversationThread` keys each message
  by `m.id`, only newly-appended messages mount and animate; already-rendered
  messages are untouched.
- **Attachments & tool-call trace** ride in with their parent `GastiMessage` — no
  separate stagger. Keeps the entrance calm.

---

## 4. Interactive feedback (press + hover)

No new code — these are **already coded** and start working once §2.1 lands.
This section is a verification checklist for the implementation plan.

- **Press** — `active:scale-[0.985]` @ `duration-fast` (140ms) `ease-out` on:
  `shared/ui/button.tsx`, `shared/ui/option-pill-stack.tsx`,
  `shared/ui/theme-toggle.tsx`, `chat/components/composer.tsx` (send button).
  Buttons do **not** bounce — `ease-out`, not spring.
- **Hover** — `suggestion-chip.tsx` lifts its shadow on hover @ `duration-base`
  (260ms). `DESIGN.md` specifies hover lifts elevation `e-2 → e-3`: verify the
  hover class lands on the `e-3` shadow token, and change it if it currently
  lifts only to `e-2`.
- Display-only cards (`TransactionListCard`, `BudgetProgressCard`) get **no**
  hover motion — they are not interactive.

---

## 5. BarMeter fill

`shared/ui/bar-meter.tsx` already animates its fill `0 → value` via a React state
transition with `transition-[width] duration-base ease-out`. The `duration-base`
fix (§2.1) makes the 260ms fill work.

**Reduced-motion guard (JS):** the fill is state-driven, so the global CSS block
is not enough on its own. In the existing `useEffect`:

- Detect `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
- If reduced motion is set, set `displayed` straight to `target` with **no**
  `requestAnimationFrame` deferral.

The `prefers-reduced-motion` check must run **inside `useEffect`** (client-only,
post-mount) so the server and client first render identically (`displayed = 0`),
avoiding a hydration mismatch. The CSS `transition-[width]` is already neutralized
by the global block, so the corrected value applies instantly.

---

## 6. Tool-call disclosure expand

`chat/components/tool-call-trace.tsx` is currently a native `<details>` element.
A native `<details>` toggles its content with `display: none`, which cannot be
transitioned. To animate the expansion:

- **Convert** `ToolCallTrace` from `<details>/<summary>` to a controlled
  disclosure: an `useState` open flag, a `<button>` with `aria-expanded` and
  `aria-controls`, and a content region with a matching `id`. Accessibility parity
  with `<details>` is preserved (focusable trigger, expanded state announced).
- **Animate** the content region with the CSS grid-rows technique:
  `grid-template-rows: 0fr` (collapsed) → `1fr` (expanded), with the inner wrapper
  set to `overflow: hidden; min-height: 0;`. Add a content `opacity` fade.
- **Timing:** `480ms` (`duration-slow`), `--ease-out` — `DESIGN.md`'s
  "card / sheet expansion" value.
- The component stays a Client Component (`'use client'`).

---

## 7. Thinking states

### 7.1 Sparkle pulse fix

`chat/components/composer.tsx` currently pulses the send-button sparkle with
Tailwind's generic `animate-pulse` (a 2s opacity ease). Replace it with the
`animate-sparkle-pulse` utility (§2.3): scale + opacity, `1200ms`, `--ease-spring`,
infinite. This matches what `DESIGN.md` already prescribes for the thinking state.

Applied only while `state === 'thinking'`.

### 7.2 In-thread thinking indicator (polish)

New component `chat/components/thinking-indicator.tsx`:

- Renders the Gasti `Eyebrow` (`tone="ai"`, label "Gasti") plus **three dots**.
- Each dot uses `animate-thinking-dot` with a staggered `animation-delay`
  (`0ms`, `150ms`, `300ms` — set inline via `style`).
- The indicator's root element also carries `animate-message-enter`, so it
  appears with the same motion as a message.

Wiring:

- `ConversationThread` gains an optional prop `pending?: boolean`.
- It renders `<ThinkingIndicator />` after the message list when `pending` is true.
- `ChatScreen` passes `pending={status === 'thinking'}`.
- The autoscroll `useEffect` in `ConversationThread` adds `pending` to its
  dependency array so the indicator scrolls into view when it appears.

This fills the current gap: while Gasti "thinks", only the composer placeholder
changes — nothing appears in the thread.

---

## 8. Ambient polish

### 8.1 Mesh drift

`shared/mesh/mesh-background.tsx` — the `.bg-mesh` element gains the
`animate-mesh-drift` utility (§2.3): a very slow (~28s) translate loop,
`--ease-in-out`, infinite. Translate/opacity only — never scale or rotate, per
`DESIGN.md`.

### 8.2 Landing → chat crossfade

Today `MeshBackground` is conditionally mounted (`{isEmpty && <MeshBackground />}`)
in `chat-screen.tsx`, so it hard-cuts when the first message is sent.

- Keep `MeshBackground` **always mounted**.
- Drive its visibility with an opacity class bound to `isEmpty`
  (`opacity-100` when empty → `opacity-0` once a message exists), with
  `transition-opacity duration-base` (260ms).
- The hero → thread swap itself is covered by the message-entrance animation; no
  extra work needed there.

### 8.3 Option-pill resolve fade

`shared/ui/option-pill-stack.tsx` — when a pill becomes `disabled` (its options'
group is `resolved`), add `transition-opacity duration-base` so the pill fades to
its dimmed state instead of snapping.

---

## 9. `DESIGN.md` amendment

Because the chosen character exceeds the current baseline, update
`DESIGN.md`'s Motion section:

- Add a **Message entrance** line documenting the `message-enter` motion
  (320ms, `--ease-spring`, fade + 10px rise).
- Broaden the spring rule from *"`--ease-spring` is allowed **only** on the AI
  sparkle pulse"* to *"`--ease-spring` is allowed on the AI sparkle pulse and on
  message entrance. Buttons still do not bounce."*

`DESIGN.md` remains the source of truth for the motion system.

---

## 10. Files touched

| File | Change |
|---|---|
| `apps/ui/tailwind.config.ts` | fix `transitionDuration` units; add `animation` utilities |
| `apps/ui/app/globals.css` | add `@keyframes` (§2.2) |
| `apps/ui/src/shared/ui/bar-meter.tsx` | reduced-motion JS guard |
| `apps/ui/src/shared/ui/option-pill-stack.tsx` | resolve-fade transition |
| `apps/ui/src/chat/components/user-message.tsx` | `animate-message-enter` on root |
| `apps/ui/src/chat/components/gasti-message.tsx` | `animate-message-enter` on root |
| `apps/ui/src/chat/components/tool-call-trace.tsx` | `<details>` → controlled disclosure + expand animation |
| `apps/ui/src/chat/components/composer.tsx` | `animate-sparkle-pulse` for thinking state |
| `apps/ui/src/chat/components/conversation-thread.tsx` | `pending` prop; render indicator; autoscroll dep |
| `apps/ui/src/chat/components/chat-screen.tsx` | always-mount mesh w/ opacity; pass `pending` |
| `apps/ui/src/shared/mesh/mesh-background.tsx` | `animate-mesh-drift`; opacity prop/class |
| `apps/ui/src/chat/components/thinking-indicator.tsx` | **new** component |
| `DESIGN.md` | Motion section amendment |

---

## 11. Verification / definition of done

- `bun --filter=ui run typecheck` exits 0.
- `bun run build --filter=ui` succeeds.
- Manual, normal motion: sending a message animates it in with a gentle spring
  rise; the thinking indicator appears in-thread while Gasti replies; tool-call
  disclosure expands smoothly (~480ms); button/pill presses scale; BarMeter fills
  from 0; sparkle pulses while thinking; mesh drifts slowly; mesh crossfades out
  on first message.
- Manual, `prefers-reduced-motion: reduce` (DevTools emulation): **no** motion
  anywhere — messages, indicator, disclosure, BarMeter, sparkle, mesh all render
  directly in final state.

---

## 12. Out of scope

- Streaming/partial-token animation of Gasti replies.
- Per-attachment staggered entrance.
- Page-route transitions (single route app).
- Tests — the project has no test suite (per `PRODUCT.md`); `typecheck` + `build`
  are the gates.
