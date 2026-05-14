# Gasti Chat UI — Design Spec

**Date:** 2026-05-14
**Scope:** `apps/ui` only. The conversational chat surface (landing + active conversation) and all the design-system primitives it consumes. Light and dark themes.
**References:** `PRODUCT.md` (product domain), `DESIGN.md` (visual system), `CLAUDE.md` (architectural rules).

This document is the spec for the UI. It does not yet describe the implementation plan (file-by-file tasks, commit boundaries) — that comes next via the `writing-plans` skill.

---

## 1. Goal and non-goals

### Goal

Implement Gasti's UI per `DESIGN.md`, on top of the existing bare `apps/ui` Next.js 15 + React 19 + Tailwind 3 scaffold. The result is a fully componentized chat surface with realistic mock data behind a clean repository seam, ready to be wired to `apps/ai` later without component changes.

### Non-goals (v1 of the UI)

- No real LLM integration. The chat answers come from a deterministic mock repository.
- No backend (`apps/api`, `apps/ai`) work in this slice.
- No persistence beyond `localStorage` for the theme preference.
- No separate routes for budgets / transactions / settings. Per `PRODUCT.md`, Gasti is the chat itself; rich content renders inline as agent message attachments.
- No tests as a deliverable, per `PRODUCT.md` §Testing Decisions. Architecture remains testable.
- No microphone input, no onboarding wizard, no marketing surface.

---

## 2. Architecture — Clean Architecture in `apps/ui`

The UI app follows the same layering CLAUDE.md mandates for the other workspaces, with the Next.js `app/` directory acting as the thin route-segment interface and a `src/` tree holding feature folders.

```
apps/ui/
├── app/                                    ← Next.js route segments (thin interface)
│   ├── layout.tsx                          ← font loading, no-flash theme script, providers wiring
│   ├── globals.css                         ← all CSS variables (light + dark) from DESIGN.md
│   └── page.tsx                            ← renders <ChatScreen/> from features/chat
│
├── src/
│   ├── chat/                               ← feature: the conversation
│   │   ├── domain/
│   │   │   ├── message.ts                  ← Message, ToolCall, MessageAttachment, Locale
│   │   │   ├── conversation.ts             ← Conversation entity
│   │   │   └── chat-repository.ts          ← interface ChatRepository + ReplyEvent
│   │   ├── use-cases/
│   │   │   ├── send-user-message.ts
│   │   │   ├── load-initial-conversation.ts
│   │   │   └── confirm-mutation.ts
│   │   ├── providers/
│   │   │   └── language-detector.ts        ← detect es vs en per turn
│   │   ├── repositories/
│   │   │   └── mock-chat-repository.ts     ← scripted replies, tool traces, attachments
│   │   ├── infrastructure/
│   │   │   ├── chat-context.tsx            ← React Context: constructs repo, injects into use-cases
│   │   │   └── use-chat.ts                 ← hook surfaced to components
│   │   └── components/
│   │       ├── chat-screen.tsx             ← orchestrator: landing ↔ active
│   │       ├── landing-hero.tsx
│   │       ├── conversation-thread.tsx
│   │       ├── user-message.tsx
│   │       ├── gasti-message.tsx
│   │       ├── message-attachments.tsx     ← switch over attachment.kind
│   │       ├── tool-call-trace.tsx
│   │       ├── composer.tsx
│   │       └── header.tsx
│   │
│   ├── transactions/                       ← feature: transactions rendering
│   │   ├── domain/
│   │   │   └── transaction.ts              ← Transaction entity + Category union
│   │   ├── providers/
│   │   │   ├── currency-formatter.ts       ← es-AR formatter, signed amount support
│   │   │   └── date-formatter.ts           ← "8 may, 9:10pm" / "May 8, 9:10pm"
│   │   └── components/
│   │       ├── transaction-row.tsx
│   │       └── transaction-list-card.tsx
│   │
│   ├── budgets/                            ← feature: budget rendering
│   │   ├── domain/
│   │   │   └── budget-progress.ts          ← BudgetProgress value object
│   │   ├── providers/
│   │   │   └── budget-state.ts             ← pos / warn / neg tone resolution
│   │   └── components/
│   │       └── budget-progress-card.tsx
│   │
│   └── shared/                             ← cross-cutting design-system primitives
│       ├── ui/
│       │   ├── card.tsx
│       │   ├── button.tsx
│       │   ├── pill.tsx
│       │   ├── suggestion-chip.tsx
│       │   ├── eyebrow.tsx
│       │   ├── num.tsx
│       │   ├── bar-meter.tsx
│       │   ├── option-pill-stack.tsx
│       │   └── theme-toggle.tsx
│       ├── icons/
│       │   ├── sparkle.tsx
│       │   └── category-icon.tsx
│       ├── mesh/
│       │   └── mesh-background.tsx
│       └── theme/
│           ├── tokens.ts                   ← TS union types for variants
│           └── theme-provider.tsx          ← optional client context (toggle uses it)
│
├── public/
│   └── sparkle.svg                         ← the 4-point AI marker
├── tailwind.config.ts                      ← bridges CSS variables into Tailwind utilities
└── ...
```

### Layer responsibilities

| Layer | What lives here | What does NOT live here |
|---|---|---|
| **Domain** | TS types, entities, value objects, repository interfaces. Pure TS. | React, Next, Tailwind, fetch, framework imports. |
| **Use-cases** | One pure function per intent. Takes a request + injected interfaces. Returns events or results. | Direct repository instantiation, React state, fetch calls inline. |
| **Providers** | Pure helpers: formatters, detectors, calculators. | State, framework code. |
| **Repositories** | Concrete `ChatRepository` implementations. `MockChatRepository` for v1. | Business logic that belongs in a use-case. |
| **Infrastructure** | React context + hooks that DI repos/use-cases into the component tree. | Domain types (it imports them, but they're declared elsewhere). |
| **Interface (thin)** | Next.js route handlers, React components. | Branching business logic — components read `useChat()` and render. |

### Consequences

- A `TransactionRow` imports a `Transaction` and a `currency-formatter` and renders. It never reads state, never decides anything.
- `ChatScreen` never imports `MockChatRepository`. It calls `useChat()`. The mock-vs-http swap is one line in `chat-context.tsx`.
- Domain types are framework-agnostic — they could be lifted into a workspace package later without rewrites.

---

## 3. Tokens, Tailwind bridge, fonts, assets

### CSS variables — `apps/ui/app/globals.css`

`globals.css` declares every variable from `DESIGN.md` §Color tokens, §Typography, §Spacing & radii, §Elevation/blur/motion under `:root`. Variable names match DESIGN.md verbatim. The file additionally declares:

- `::selection` rule per DESIGN.md.
- `.bg-mesh { background: var(--mesh-ambient); }`.
- Number classes `.num`, `.num-xl`, `.num-lg`, `.num-md`, `.num-sm` per DESIGN.md §Typography.
- `.editorial { font-family: var(--font-editorial); font-style: italic; font-weight: 400; }`.
- Default body styles: `background: var(--surface-1)`, `color: var(--ink-1)`, antialiased.
- `color-scheme: light dark` on `:root` so native UI (scrollbars, default form controls) follows the active mode.
- `@media (prefers-reduced-motion: reduce)` clamps ambient durations and disables mount animations.

The full dark-mode override block lives under `:root[data-theme="dark"]` and is mirrored into `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`. See §6 for the dark tokens.

### Tailwind theme bridge — `apps/ui/tailwind.config.ts`

Extends Tailwind so utilities read semantic names (`bg-surface-0`, `text-ink-1`, `rounded-lg`, `shadow-2`). The full extension:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: { 0: 'var(--surface-0)', 1: 'var(--surface-1)', 2: 'var(--surface-2)', 3: 'var(--surface-3)', tint: 'var(--surface-tint)' },
        ink:     { 1: 'var(--ink-1)', 2: 'var(--ink-2)', 3: 'var(--ink-3)', 4: 'var(--ink-4)', mesh: 'var(--ink-on-mesh)' },
        brand:   { DEFAULT: 'var(--brand-indigo)', deep: 'var(--brand-indigo-deep)', soft: 'var(--brand-indigo-soft)' },
        ai:      { DEFAULT: 'var(--ai-violet)', soft: 'var(--ai-violet-soft)', ink: 'var(--ai-violet-ink)' },
        pos:     'var(--pos)', 'pos-soft': 'var(--pos-soft)',
        neg:     'var(--neg)', 'neg-soft': 'var(--neg-soft)',
        warn:    'var(--warn)', 'warn-soft': 'var(--warn-soft)',
        info:    'var(--info)', 'info-soft': 'var(--info-soft)',
        line:    { 1: 'var(--line-1)', 2: 'var(--line-2)', mesh: 'var(--line-mesh)' },
      },
      borderRadius: { xs: 'var(--r-xs)', sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)', '2xl': 'var(--r-2xl)', pill: 'var(--r-pill)' },
      spacing: { 1: 'var(--s-1)', 2: 'var(--s-2)', 3: 'var(--s-3)', 4: 'var(--s-4)', 5: 'var(--s-5)', 6: 'var(--s-6)', 7: 'var(--s-7)', 8: 'var(--s-8)', 9: 'var(--s-9)', 10: 'var(--s-10)' },
      boxShadow: { 1: 'var(--e-1)', 2: 'var(--e-2)', 3: 'var(--e-3)', 4: 'var(--e-4)', 'glow-ai': 'var(--e-glow-ai)', 'brand-glow': 'var(--brand-glow)' },
      fontFamily: { display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'], mono: ['var(--font-mono)', 'ui-monospace', 'monospace'], editorial: ['var(--font-editorial)', 'serif'] },
      transitionTimingFunction: { out: 'var(--ease-out)', inout: 'var(--ease-in-out)', spring: 'var(--ease-spring)' },
      transitionDuration: { fast: '140', base: '260', slow: '480', ambient: '1200' },
      backdropBlur: { 1: '8px', 2: '18px', 3: '32px' },
    },
  },
  plugins: [],
};

export default config;
```

**Why:** CSS variables are the single source of truth. Renaming a token is one line. Tailwind utilities stay readable. Dark mode flips through the same variables; almost no `dark:` utilities are needed.

### Fonts — `next/font/google` in `app/layout.tsx`

```ts
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-display' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' });
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: 'italic', variable: '--font-editorial' });
```

The variables mount on `<html className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>` so all CSS picks them up. Zero CLS, self-hosted via next/font.

### Sparkle asset — `apps/ui/public/sparkle.svg`

The exact SVG from `DESIGN.md` §Iconography. The `<Sparkle>` component inlines it as JSX (for color/size control via `currentColor`) so its color follows the surrounding text.

### TS-level token names — `src/shared/theme/tokens.ts`

Exports union types for component variants only:

```ts
export type NumTone = 'ink' | 'pos' | 'neg' | 'warn';
export type ButtonVariant = 'primary' | 'secondary' | 'frosted' | 'ghost';
export type CardVariant = 'plain' | 'lavender' | 'frosted';
export type Category = 'comida' | 'transporte' | 'entretenimiento' | 'salud' | 'servicios' | 'educacion' | 'otros';
```

No values, only names — keeps prop types honest without duplicating the token store.

---

## 4. Component inventory

### Primitives — `src/shared/ui/`

| Component | Variants / props | Role |
|---|---|---|
| `<Card>` | `variant: 'plain' \| 'lavender' \| 'frosted'`, `elevation?: 1 \| 2 \| 3`, `radius?: 'md' \| 'lg' \| 'xl'` | Canonical 20px card. Lavender = `--surface-tint` + no shadow. Frosted = `--surface-frost` + `backdrop-filter: var(--blur-2)` + inner top highlight via `box-shadow: inset 0 1px 0 var(--line-inner)`. |
| `<Button>` | `variant: 'primary' \| 'secondary' \| 'frosted' \| 'ghost'`, `size?: 'md' \| 'sm'`, `disabled?`, `onClick` | Pill. Primary = `--brand-grad` + `--brand-glow`. Press = `scale(0.985)` 140ms. Focus = `--ai-violet` 2px outline, 2px offset. Frosted variant reads `var(--surface-frost-2)` so it themes. |
| `<Pill>` | `tone?: 'neutral' \| 'ai'`, `children` | Inline pill. Used for the "Vos" label above user messages, tool-call chips, etc. |
| `<SuggestionChip>` | `icon: LucideIcon`, `label`, `onClick` | Lavender row: 36×36 icon tile (`--r-sm`, `--ai-violet-soft`, Lucide in `--ai-violet-ink`) + label + chevron-right in `--ink-3`. |
| `<Composer>` | `value`, `onChange`, `onSubmit`, `placeholder`, `state: 'idle' \| 'thinking' \| 'disabled'` | Frosted pill input + send button (36×36 circle, `--brand-grad`, white sparkle). Thinking state pulses the sparkle and swaps placeholder. |
| `<Eyebrow>` | `tone?: 'ink' \| 'ai'`, `children` | Uppercase tracked label (`--t-label-tiny`, `--tracking-eyebrow`). When `tone="ai"`, prepends a 14px `<Sparkle>` in `--ai-violet`. |
| `<Num>` | `value: number`, `size?: 'sm' \| 'md' \| 'lg' \| 'xl'`, `tone?: NumTone`, `signed?: boolean`, `delta?: boolean` | Geist Mono + tabular. Formats with es-AR locale, currency baked in. Uses proper `−` (U+2212), not hyphen. `delta` shows leading `+` for positive. |
| `<BarMeter>` | `value: 0..1`, `tone: 'pos' \| 'warn' \| 'neg'`, `animateOnMount?: boolean` | 6px pill bar. Animates 0→value 260ms `--ease-out` on first mount; disabled when `prefers-reduced-motion`. |
| `<OptionPillStack>` | `options: { id, label, intent?, disabled? }[]`, `onPick: (id) => void` | Vertical stack of lavender pills used for confirmations and structured choices. |

### Icons — `src/shared/icons/`

| Component | Role |
|---|---|
| `<Sparkle size?>` | The 4-point custom SVG, inlined. Color via `currentColor`; default `text-ai`. `aria-hidden`. |
| `<CategoryIcon category, size?>` | Maps category union to Lucide glyph per DESIGN.md table. Unknown category falls back to `tag`. 1.5px stroke. |

### Mesh — `src/shared/mesh/`

| Component | Role |
|---|---|
| `<MeshBackground>` | Renders `.bg-mesh` full-bleed. Used only behind the landing surface and modals. The token swaps in dark mode; the component is unchanged. |

### Chat — `src/chat/components/`

| Component | Role |
|---|---|
| `<ChatScreen>` | Client component. Top-level orchestrator. Reads `useChat()`. Composes `<Header>` + (landing \| thread) + `<Composer>`. |
| `<LandingHero>` | Frosted hero card. Headline `Tu asistente financiero conversacional`; the words *asistente financiero* are wrapped in a `<span style={{ color: 'var(--ai-violet-ink)' }}>` per DESIGN.md §"Inline AI accent" (color, not bold). At most one editorial italic subline; 4 suggestion chips. |
| `<ConversationThread>` | Renders ordered messages. `role="log" aria-live="polite" aria-atomic="false"`. |
| `<UserMessage>` | Right-aligned `<Card>` with `<Pill tone="ai">Vos</Pill>` above. Max-width 480px. |
| `<GastiMessage>` | No card. `<Eyebrow tone="ai">GASTI</Eyebrow>` above. Body prose. Below: optional `<MessageAttachments>`, then `<ToolCallTrace>`. Max-width 540px. |
| `<MessageAttachments>` | Switches over `attachment.kind`: `transactionList` → `<TransactionListCard>`, `budgetProgress` → `<BudgetProgressCard>`, `optionPills` → `<OptionPillStack>`. Single switch — the only place features intersect. |
| `<ToolCallTrace>` | `<details>` element. Summary: `<Eyebrow>TOOLS</Eyebrow>` + hairline pill per tool with the tool name in mono. Expanded body: `--surface-tint` card with monospaced JSON of the inputs. |
| `<Composer>` | Sticky bottom of `main`. Frosted pill. See primitive spec above. |
| `<Header>` | 56px row. Gasti wordmark (Geist 600, 18px, `--ink-1`) left; `<ThemeToggle>` + settings icon right. Frosted strip over hero, solid white in active conversation. |

### Transactions — `src/transactions/components/`

| Component | Role |
|---|---|
| `<TransactionRow>` | 36×36 `<CategoryIcon>` tile + title block (merchant top, `--t-title-sm` `--ink-1`; date label bottom, `--t-label` `--ink-3`) + amount block (`<Num signed tone={amount<0?'neg':'pos'}>` top, category label bottom). |
| `<TransactionListCard>` | `<Card>` wrapping rows with `--line-1` dividers indented 62px from left. |

### Budgets — `src/budgets/components/`

| Component | Role |
|---|---|
| `<BudgetProgressCard>` | `<Card variant="lavender" radius="lg">`. Top row: category label + `<Num size="sm">` spent + " / " + `<Num size="sm">` budget. Middle: `<BarMeter>`. Bottom (optional): projection caption in `--t-label` `--ink-3`. Tone resolved by `budget-state.ts` provider. |

### Composition discipline

- Primitives never import from feature folders.
- Feature components compose primitives + their own domain. They never know about other features (a `TransactionRow` never imports anything from `budgets`).
- `<MessageAttachments>` is the *only* place where features intersect, and it discriminates by string `kind` — no cross-feature internal imports.

### React rules (`vercel-react-best-practices`)

- Server Components by default. Client boundaries: `<ChatScreen>` (state), `<Composer>` (input), `<ToolCallTrace>` (disclosure toggle), `<BarMeter>` (mount animation), `<ThemeToggle>` (localStorage).
- Mock data is loaded at the boundary (`<ChatScreen>` via `useChat()`) and passed down as plain props.
- No `useEffect` for data; the mock returns synchronously (or via async iterable). Animations use CSS keyframes, with `useLayoutEffect` only when measurement is required.
- Strict typing — no `any`, no implicit string-prop colors.

---

## 5. Chat data flow

### Domain types — `src/chat/domain/`

```ts
// message.ts
export type Locale = 'es' | 'en';

export type ToolCall = {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
};

export type MessageAttachment =
  | { kind: 'transactionList'; items: Transaction[] }
  | { kind: 'budgetProgress';  progress: BudgetProgress }
  | { kind: 'optionPills';     options: { id: string; label: string; intent?: 'confirm' | 'cancel' }[]; resolved?: boolean };

export type UserMessage  = { id: string; role: 'user';  locale: Locale; text: string; sentAt: string };
export type GastiMessage = {
  id: string; role: 'gasti'; locale: Locale;
  text: string;
  toolCalls?: ToolCall[];
  attachments?: MessageAttachment[];
  sentAt: string;
};
export type Message = UserMessage | GastiMessage;
```

```ts
// chat-repository.ts
export interface ChatRepository {
  loadInitial(): Promise<Conversation>;
  reply(input: { text: string; locale: Locale; history: Message[] }): AsyncIterable<ReplyEvent>;
  confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent>;
}

export type ReplyEvent =
  | { kind: 'thinking' }
  | { kind: 'toolCall'; call: ToolCall }
  | { kind: 'partial'; text: string }
  | { kind: 'final'; message: GastiMessage };
```

**Why async iterable:** lets the mock simulate `thinking → tool call → final` with realistic timing; lets a future HTTP-backed implementation stream events the same way. Components consume a stream.

### Use-cases — `src/chat/use-cases/`

Each is a factory: takes injected dependencies, returns a function. Pure TS, no React.

- `send-user-message.ts` — appends `UserMessage`, sets status to thinking, consumes `repo.reply(...)`, appends `GastiMessage` on `final`.
- `load-initial-conversation.ts` — returns `repo.loadInitial()`.
- `confirm-mutation.ts` — given an `optionId` and the current history, consumes `repo.confirmOption(...)`, marks the previous option pills `resolved: true`, appends the new `GastiMessage`.

### Mock repository — `src/chat/repositories/mock-chat-repository.ts`

Scripted, deterministic. Pattern-matches the latest user text against a small table:

| Trigger phrase (es \| en) | Events emitted |
|---|---|
| comida + este mes / food + this month | `thinking` → 250ms → `toolCall { name: 'sumSpendByCategory', inputs: { category: 'comida', period: 'currentMonth' } }` → 400ms → `final` with text + `transactionList` of 4 recent comida rows |
| gasté más + semana / spent most + week | `thinking` → `toolCall { topCategoriesInRange }` → `final` with ranked breakdown text |
| proyectá / project + mes / month | `thinking` → `toolCall { projectMonthEnd }` → `final` with projection + caveat |
| cómo voy + comida / how am I doing + food | `thinking` → `toolCall { getBudgetProgress }` → `final` with text + `budgetProgress` attachment |
| borrá / delete + última / last | `final` (no thinking) with text + `optionPills` confirmation |
| _otherwise_ | `thinking` → `final` with a polite "no entendí esa, probá con…" reply |

Mock data lives as TS constants at module scope (no fs read; the UI app must build on Vercel without filesystem access in components). Hardcoded list of ~12 transactions across categories; one `BudgetProgress` for `comida`. All amounts are realistic ARS values so the `<Num>` component exercises tabular alignment.

### Infrastructure — `src/chat/infrastructure/`

```ts
// chat-context.tsx (client component)
'use client';

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  // The ONE place the concrete repository is constructed.
  // Swap line for HttpChatRepository when apps/ai is ready.
  const repo = useMemo(() => new MockChatRepository(), []);
  const sendUserMessage = useMemo(() => makeSendUserMessage({ repo, detectLocale }), [repo]);
  const confirmMutation = useMemo(() => makeConfirmMutation({ repo, detectLocale }), [repo]);

  const [state, dispatch] = useReducer(chatReducer, initialState);

  const sendMessage = useCallback(async (text: string) => {
    for await (const ev of sendUserMessage({ text, history: state.messages })) {
      dispatch({ type: 'EVENT', event: ev });
    }
  }, [sendUserMessage, state.messages]);

  const pickOption = useCallback(/* analogous, uses confirmMutation */);

  return <ChatContext.Provider value={{ ...state, sendMessage, pickOption }}>{children}</ChatContext.Provider>;
}
```

```ts
// use-chat.ts
export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
```

State shape:

```ts
type ChatState = {
  messages: Message[];
  status: 'idle' | 'thinking';
};
```

Reducer actions correspond 1:1 to event kinds: `APPEND_USER`, `SET_THINKING`, `ADD_TOOL_CALL_TO_PENDING`, `APPEND_GASTI`, `MARK_OPTIONS_RESOLVED`. Tiny, traceable.

### Render flow — one full turn

```
User types → onSubmit(text) → useChat().sendMessage(text)
  ↓
sendUserMessage iterates events:
  • APPEND_USER          → <UserMessage> appears
  • SET_THINKING         → <Composer> shows pulsing sparkle + "Buscando..." / "Thinking..."
  • ADD_TOOL_CALL_TO_PENDING → reserved for streaming; mock skips for v1
  • APPEND_GASTI         → <GastiMessage> + <ToolCallTrace> + <MessageAttachments> render
  ↓
Status returns to idle.
```

### Mutation-confirmation flow

User: "borrá la última transacción"

1. Mock emits `final` (no thinking — deterministic). Body: "¿Querés borrar **Café Martinez — $3.000** del 7 may?" with the amount fragment wrapped in `<Num>`.
2. Attachment kind `optionPills`: `[{ id: 'confirm', label: 'Sí, borralo', intent: 'confirm' }, { id: 'cancel', label: 'Cancelar', intent: 'cancel' }]`.
3. `<OptionPillStack>` renders two lavender pills under the message.
4. User clicks `Sí, borralo` → `pickOption('confirm')` → `confirmMutation` use-case.
5. Reducer dispatches `MARK_OPTIONS_RESOLVED` on the previous attachment (the option pills dim via `opacity:0.32`, become non-interactive) and appends a new Gasti message: "Listo. Borrada."

No red destructive color anywhere — DESIGN.md prescribes language carries the weight.

---

## 6. Dark mode

### Strategy

- `data-theme` attribute on `<html>`: `"light"` | `"dark"` | unset (= follow system).
- All theming flows through CSS variables. The component layer does not branch on theme.
- Persisted in `localStorage.gasti-theme`. No-flash inline script in `<head>` applies the attribute before paint.
- Tailwind `darkMode: ['selector', '[data-theme="dark"]']` makes `dark:` utilities available for one-off cases, but discipline is no `dark:` utilities — semantic tokens handle it.

### Dark token overrides — appended to `globals.css`

```css
:root[data-theme="dark"] {
  /* Mesh — same warm-cool feeling, dimmed for night */
  --mesh-ambient:
    radial-gradient(60% 55% at 12% 18%, rgba(255,176,136,0.32) 0%, rgba(255,176,136,0) 60%),
    radial-gradient(55% 50% at 92% 12%, rgba(255,122,92,0.28)  0%, rgba(255,122,92,0)  62%),
    radial-gradient(70% 60% at 18% 92%, rgba(106,139,255,0.30) 0%, rgba(106,139,255,0) 65%),
    radial-gradient(70% 70% at 88% 88%, rgba(182,156,255,0.32) 0%, rgba(182,156,255,0) 65%),
    linear-gradient(135deg, #1B1430 0%, #181433 50%, #14132E 100%);

  /* Surfaces — never pure black; deep warm indigo-charcoal */
  --surface-0:       #1B1928;
  --surface-1:       #13111F;
  --surface-2:       #221F32;
  --surface-3:       #2A2740;
  --surface-tint:    #221A38;
  --surface-frost:   rgba(27, 25, 40, 0.55);
  --surface-frost-2: rgba(27, 25, 40, 0.40);

  /* Ink — warm off-white top; never pure white */
  --ink-1:           #F5F4FB;
  --ink-2:           #C9C5DC;
  --ink-3:           #8F8AA8;
  --ink-4:           #5C5876;

  /* Brand & AI — lifted for legibility on dark */
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

  /* Lines — light hairlines on dark */
  --line-1:     rgba(255, 255, 255, 0.06);
  --line-2:     rgba(255, 255, 255, 0.10);
  --line-mesh:  rgba(255, 255, 255, 0.18);
  --line-inner: rgba(255, 255, 255, 0.10);

  /* Semantic — brightened for dark; soft variants are tinted dark surfaces */
  --pos:      #38D69E;   --pos-soft:  #1A3328;
  --neg:      #FF6B6B;   --neg-soft:  #361F23;
  --warn:     #FFB95C;   --warn-soft: #2E2419;
  --info:     #6E94FF;   --info-soft: #1C233E;

  /* Elevation — visible halos; AI glow gets a touch stronger */
  --e-1: 0 1px 2px rgba(0,0,0,0.30), 0 1px 1px rgba(0,0,0,0.20);
  --e-2: 0 4px 14px -6px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.20);
  --e-3: 0 16px 40px -16px rgba(0,0,0,0.60), 0 4px 12px rgba(0,0,0,0.25);
  --e-4: 0 30px 80px -28px rgba(0,0,0,0.75), 0 8px 24px rgba(0,0,0,0.30);
  --e-glow-ai: 0 12px 36px -12px rgba(145, 131, 255, 0.55);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Same dark overrides as the [data-theme="dark"] block above. */
    /* DRY in implementation via PostCSS or shared @apply layer; conceptually identical. */
  }
}
```

### Components that need theme-awareness

The component layer remains theme-agnostic. The two literal-color exceptions in `DESIGN.md` are tokenized so they can theme:

| Component | Adjustment |
|---|---|
| `<Card variant="frosted">` | Reads `var(--surface-frost)` instead of `rgba(255,255,255,0.62)` literal. Inner highlight reads `var(--line-inner)`. |
| `<Button variant="frosted">` | Reads `var(--surface-frost-2)` instead of `rgba(255,255,255,0.55)` literal. |
| `<Composer>` | Reads `var(--surface-frost)` for its glass background. |

All other components read existing tokens that already swap.

### Theme toggle — `src/shared/ui/theme-toggle.tsx`

- Ghost button, 44×44 hit area, 20px Lucide icon. Sits in `<Header>` next to the settings icon.
- Cycles `system → light → dark → system` on click.
- Icon: `monitor` (system) | `sun` (light) | `moon` (dark). Color `--ink-2`.
- Persists to `localStorage.gasti-theme` and updates `document.documentElement.dataset.theme`.
- `aria-label` localized; `aria-pressed` reflects whether a manual override is active.

### No-flash script — `app/layout.tsx`

```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html:
    `try{var t=localStorage.getItem('gasti-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`
  }} />
</head>
```

Runs synchronously before React hydration. Prevents the light flash on first paint.

### Forbidden in dark mode

- No pure `#000` background. The darkest surface is `--surface-1 = #13111F`.
- No pure `#FFF` text. The brightest ink is `--ink-1 = #F5F4FB`.
- No high-contrast traffic-light reds/greens — semantic colors remain desaturated by intent.

### Accessibility (dark-specific)

Contrast pairs verified WCAG AA:

- `--ink-1` (`#F5F4FB`) on `--surface-0` (`#1B1928`) ≈ 16:1.
- `--ink-3` (`#8F8AA8`) on `--surface-tint` (`#221A38`) ≈ 5.2:1 for label-size text.
- `--ai-violet-ink` (`#B7ADFF`) on `--surface-tint` (`#221A38`) ≈ 6.5:1.
- `--neg` (`#FF6B6B`) on `--surface-0` (`#1B1928`) ≈ 6:1.

Bar-meter fills retain ≥3:1 against `--surface-3`. Focus ring stays `--ai-violet`, brightened for dark.

---

## 7. Screen states and responsive behavior

### State map

| State | Trigger | Surface | Hero | Composer |
|---|---|---|---|---|
| Empty / landing | `messages.length === 0` | `<MeshBackground>` full-bleed | `<LandingHero>` centered, frosted, with 4 suggestion chips | Sticky frosted pill, idle placeholder |
| Active | `messages.length > 0` | `--surface-1` solid | Hidden | Sticky pill |
| Thinking | `status === 'thinking'` | unchanged | unchanged | Pulsing sparkle send button, "Buscando..." placeholder, input disabled |
| Awaiting confirmation | last Gasti message has `optionPills` attachment | unchanged | unchanged | Enabled (user may also type) |

Transition Landing → Active: implicit unmount/mount on first user message; mesh fades out 260ms `--ease-out` (opacity-only). Disabled under `prefers-reduced-motion`.

### Responsive (DESIGN.md §Layout, made concrete)

| Viewport | Page gutters | Content max-width | Suggestion chips |
|---|---|---|---|
| `<640px` | `px-4` (16px) | full | stacked, full-width |
| `640–1024px` | `px-6` (24px) | `max-w-[720px] mx-auto` | stacked, ≤ column |
| `≥1024px` | `px-8` (32px) | `max-w-[720px] mx-auto` | unchanged |

Header is always 56px. No two-column layout, no sidebar — "the product is a chat — a chat is a column."

---

## 8. Accessibility

(Light- and dark-mode shared. Dark-specific contrasts are in §6.)

- **Keyboard**: composer auto-focused on mount; `Enter` submits, `Shift+Enter` newline. Suggestion chips, option pills, theme toggle reachable via `Tab`. Focus = `--ai-violet` 2px outline + 2px offset.
- **Semantics**: `<ConversationThread>` is `role="log" aria-live="polite" aria-atomic="false"`. Each message is an `<article>` with localized `aria-label`. Tool-call trace is a `<details>` element.
- **Color contrast (light)**: `--ink-1` on `--surface-0` ≈ 18:1; `--ink-3` on `--surface-tint` ≈ 5.4:1; `--ai-violet-ink` on `--surface-tint` ≈ 7:1; `--neg` on `--surface-0` ≈ 4.9:1. All pass WCAG AA.
- **Reduced motion**: ambient pulses, mount animations, mesh fade are disabled under `prefers-reduced-motion: reduce`. Functional transitions (press scale, focus ring) remain.
- **Sparkle**: `aria-hidden="true"`. The eyebrow text "GASTI" carries the meaning.
- **Numbers**: `<Num>` renders the formatted string in DOM text; no CSS `::before` for `$` so screen readers read the currency.
- **Language tagging**: `<html lang>` is set from the latest user-message locale. Mixed-locale fragments wrap in `<span lang>`.

---

## 9. Error handling

The mock-only v1 has narrow error surfaces. Handled cases:

- **Empty user submission**: composer's `onSubmit` no-ops on empty/whitespace input. The send button is `opacity:0.32` and non-interactive while input is empty.
- **Unrecognized prompt**: mock returns a polite fallback message — never throws.
- **`useChat()` called outside `<ChatProvider>`**: hook throws with a clear message. Caught by React's error boundary (see below).
- **`localStorage` unavailable** (e.g., private mode): theme toggle silently falls back to in-memory state. The `try/catch` in the no-flash script and the toggle ensures no crash.

A small `<ErrorBoundary>` wraps `<ChatScreen>` and renders a neutral fallback card with text "Algo no anduvo bien. Recargá la página." / "Something didn't work. Refresh the page." — no destructive red.

When the HTTP repository replaces the mock, the same `ReplyEvent` shape will need a `{ kind: 'error'; message: string }` variant; this is reserved in the design (not implemented in v1) and the reducer will append a Gasti message describing the failure in the user's locale.

---

## 10. Out of scope for this UI slice

- Real LLM / Mastra wiring.
- Tests (per `PRODUCT.md`).
- Mobile chrome (status bar, tab bar).
- Light/dark mode auto-detection beyond `prefers-color-scheme` and a manual toggle.
- Streaming partial-text rendering (the reducer supports it; the mock does not exercise it).
- Voice input, push notifications, scheduled alerts.

---

## 11. Definition of done

The slice is done when:

1. `apps/ui/app/globals.css` declares every token from DESIGN.md plus the dark-mode overrides in §6.
2. `apps/ui/tailwind.config.ts` bridges those tokens to semantic Tailwind utilities.
3. Fonts (Geist, Geist Mono, Instrument Serif) load via `next/font/google` with zero CLS.
4. Every primitive in §4 exists in `src/shared/ui/` and renders correctly in isolation against tokens (verified by mounting it on the page during development).
5. The chat surface renders the landing state at `/`, accepts a user message, transitions to the active state, runs through the mock-repo flow (including a tool-call trace and at least one inline attachment kind), and the confirmation flow works end-to-end.
6. Theme toggle cycles `system → light → dark → system`; the no-flash script prevents first-paint flicker; both themes pass the contrast checks in §8.
7. Responsive breakpoints behave per §7; keyboard reaches every interactive; reduced-motion preference is honored.
8. The `ChatRepository` interface is the only seam between UI and a backend — the mock implementation is replaceable in one file.
9. `bun dev --filter=ui` runs cleanly; `bun run build --filter=ui` produces a production build without TypeScript errors.

---

## 12. References

- `PRODUCT.md` — product domain, user stories, constraints.
- `DESIGN.md` — visual identity, tokens, components, voice, layout, iconography.
- `CLAUDE.md` — architectural rules, Superpowers workflow, forbidden patterns.
- Lucide icons — https://lucide.dev (used via `lucide-react`).
- Geist / Geist Mono / Instrument Serif — Google Fonts.
