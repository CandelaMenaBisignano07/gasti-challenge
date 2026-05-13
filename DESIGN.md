# Design — Gasti

This document defines **Gasti's visual and interaction system** — the language the product is built in. It is the companion to `PRODUCT.md`: where `PRODUCT.md` says *what Gasti does and for whom*, `DESIGN.md` says *what Gasti looks and feels like* and how every interface decision is made.

The system is **calm, minimal, AI-native, softly human, neutral**. Mesh-gradient hero surfaces sit against matte-white interior frames; numbers are loud and mono; the only signal of "this is AI" is a custom sparkle glyph in soft violet. Black is forbidden as a background. Sharp corners are forbidden anywhere a finger or cursor can land.

This system is adapted from the **Wealthy AI** design system (a mobile, investment-focused, named-character assistant). The adaptations to fit Gasti are spelled out below — they are not optional; they preserve Gasti's product identity as defined in `PRODUCT.md`.

---

## Adaptations from the Wealthy AI source

Before any token or component spec, the canonical deltas:

1. **Platform: web, not mobile iOS.** The source ships an iPhone-frame UI kit (393pt width, 54px status bar, 88px tab bar). Gasti is a Next.js + React + Tailwind web app. Drop the phone chrome. Keep the visual language (mesh, frosted glass, 20px-radius cards, type system) and re-flow it for desktop-first responsive layouts.
2. **Voice: neutral, not named character.** Wealthy AI introduces itself as "Hi John, I'm Wealthy!" and speaks in the first person as a named advisor. **Gasti does not.** Per `PRODUCT.md`, the voice is neutral, informative, concise — not coachy, not gamified. The product does not name itself in greetings, does not refer to itself in the first person, and does not use exclamation marks. The visual voice rules (sentence case, no emoji, AI sparkle, loud numbers) still apply.
3. **Currency: ARS, not USD/INR.** All numeric formatting uses Argentine-Spanish locale: `$1.234,56` (dot for thousands, comma for decimals). Currency symbol is `$` baked into the number, not floating in a label. This applies regardless of whether the response language is Spanish or English.
4. **Scope: expenses, not investments.** Drop the Buy/Sell buttons, holdings cards, asset-class glyphs (`trending-up`, `coins`, `landmark`, `building-2`, `bitcoin`), portfolio donut charts, and brand-mark glyphs for stocks (Apple, Tesla, Reliance, etc.). Keep the transaction row pattern, the AI chat surface, the suggestion chip, the card silhouette, and the composer.
5. **Bilingual rendering.** All copy in the UI surfaces in either Spanish or English depending on the user's most recent input. Date and number formatting always follow `es-AR` locale conventions regardless of language. No mixed-language copy in a single response.
6. **No mobile frame, no status bar, no tab bar.** The source's `ui_kits/wealthy-mobile/` JSX is reference-only — Gasti's UI lives in `apps/ui` with a web layout.

Everything below has these adaptations folded in.

---

## Visual identity

Gasti has two visual layers that play against each other:

1. **The mesh** — large soft radial gradients (peach → sunset → rose → lilac → azure → indigo). It is the *world* the app lives in.
2. **The frame** — calm matte-white surfaces with very rounded corners, hairline borders, and ample whitespace. It is the *object* in that world.

The contrast between rich ambient color and serene white interior is the entire visual idea. Don't compromise either.

**Where each layer appears:**
- **Mesh** — only on hero surfaces: the landing chat surface (the home), onboarding-style empty states, marketing copy if any. Full-bleed when used.
- **Frame** — every working surface: conversation thread once it's been used, settings, budget views, transaction list, modals. White or `--surface-1` (#FAFAFE). The mesh is shed once the user is doing focused work.
- **Modal and sheet backgrounds** — white card on a dimmed mesh, never on a black scrim. Use `rgba(15,14,23,0.18)` with `--blur-1` instead.

**Imagery rules:**
- No patterns, no textures, no hand-drawn illustration, no photography.
- The system uses gradient and type as its only "imagery".
- The mesh imagery should always feel **warm-cool**: peach on one diagonal, blue on the other.

---

## Voice in the UI

Visual voice rules apply to all rendered copy — agent responses, tool-call labels, button text, section headers, micro-copy.

- **Sentence case for everything.** Headlines, buttons, navigation, card titles. No Title Case On Every Word. The only exception is the wordmark "Gasti" itself.
- **No emoji.** AI presence is signalled with the **sparkle glyph** (a custom 4-point spark) in `--ai-violet` — never 🤖, never 🎉. Unicode arrows (`→`, `↗`, `↘`) are allowed inline in numeric deltas.
- **Numbers are always the loud thing.** `$1.234,56`, `+12,5%`, `−$45.000` — they are large, mono, tabular. Words around numbers are quiet and small ("Total del mes", "Hoy", "Restante en comida").
- **Earned brevity.** A sentence ends as soon as it can. Periods, not exclamation marks. Em-dashes are welcome — they suggest a calm voice pausing for breath.
- **No first-person product voice.** Gasti does not say "I'm Gasti", "Let me check", "I'll show you". Responses are direct: "Gastaste $123.450 en comida este mes." Microcopy is third-person or imperative ("Buscando...", "Sin resultados.", "Decime un monto y categoría.").
- **Loading and empty micro-copy** is short and natural, never "Loading..." or a spinner without words: *"Buscando..."*, *"Un momento."*, *"Sin movimientos en ese período."* English equivalents follow the same brevity.

### Inline AI accent (sparing)

The signature inline accent — coloring one or two words inside a headline in `--ai-violet-ink` — is allowed but **rare**, at most once per surface. Reserve it for the landing chat surface, never inside a working screen. Example: *"Tu **asistente financiero** conversacional."* (the bolded fragment is the only colored span).

### Mutation confirmations

Per `PRODUCT.md`, deletes and edits require confirmation in the conversation. Visually, the confirmation appears as a card with a pair of pill buttons (`Sí, borralo` / `Cancelar`) using the standard primary-vs-secondary button styles below. No destructive-action red modal; the destructive button is a standard primary pill (the confirmation language carries the weight, not the color).

---

## Color tokens

Drop into `apps/ui/app/globals.css` as CSS variables and bridge into the Tailwind theme. The variable names are canonical — components and Tailwind utilities should reference them by name, not by literal hex.

### Mesh & ambient

```css
--mesh-peach:   #FFB088;
--mesh-sunset:  #FF7A5C;
--mesh-rose:    #F4A5C8;
--mesh-lilac:   #B69CFF;
--mesh-azure:   #6A8BFF;
--mesh-indigo:  #5B4FCF;

/* Canonical mesh gradient — drop into any large hero background */
--mesh-ambient:
  radial-gradient(60% 55% at 12% 18%,  #FFB088 0%, rgba(255,176,136,0) 60%),
  radial-gradient(55% 50% at 92% 12%,  #FF7A5C 0%, rgba(255,122,92,0)  62%),
  radial-gradient(70% 60% at 18% 92%,  #6A8BFF 0%, rgba(106,139,255,0) 65%),
  radial-gradient(70% 70% at 88% 88%,  #B69CFF 0%, rgba(182,156,255,0) 65%),
  linear-gradient(135deg, #F4A5C8 0%, #B69CFF 50%, #6A8BFF 100%);
```

### Brand & AI

```css
--brand-indigo:      #4F46E5;   /* primary CTA only */
--brand-indigo-deep: #3B30C9;
--brand-indigo-soft: #EEEBFF;
--ai-violet:         #7C6BFF;   /* AI sparkle, AI-only menu items */
--ai-violet-soft:    #F1EEFF;   /* AI-icon-tile background */
--ai-violet-ink:     #524ABF;   /* inline accent text inside headlines */

--brand-grad: linear-gradient(180deg, #6E61FF 0%, #4338CA 100%);
--brand-glow:
  0 10px 30px -10px rgba(79, 70, 229, 0.55),
  inset 0 1px 0 rgba(255,255,255,0.25);
```

**Brand-indigo discipline.** `--brand-indigo` (#4F46E5) is used **only** on the single most important CTA on a surface. Never as a decorative wash. Never on more than one button per screen.

**AI-violet discipline.** `--ai-violet` is reserved for: (1) the sparkle glyph itself, (2) the icon-tile backgrounds of AI suggestion rows, (3) the optional inline coloured word in a hero headline, (4) AI-only menu items. Treat it like paint that runs out. Overuse kills its signal.

### Surfaces (matte white with lavender hint)

```css
--surface-0:       #FFFFFF;            /* pure card */
--surface-1:       #FAFAFE;            /* page background */
--surface-2:       #F4F3FA;            /* subtle row */
--surface-3:       #ECEAF6;            /* hover / pressed neutral */
--surface-tint:    #F7F4FF;            /* lavender-tint card / suggestion row */
--surface-frost:   rgba(255,255,255,0.62); /* glass over mesh */
--surface-frost-2: rgba(255,255,255,0.42); /* deeper frost */
```

Black (`#000`) is **forbidden** as a background. If a near-black is needed for a brand glyph (e.g., a transaction row showing "Uber" with the literal Uber wordmark), it's an exception inside an icon tile, not a background.

### Ink (text)

```css
--ink-1:            #0F0E17;   /* primary body & display */
--ink-2:            #3A3849;   /* secondary */
--ink-3:            #6E6B82;   /* tertiary / labels */
--ink-4:            #A09DB4;   /* faint / placeholder */
--ink-on-mesh:      #FFFFFF;
--ink-on-mesh-mute: rgba(255,255,255,0.78);
```

Use `--ink-1` for the primary number / primary headline only. Drop to `--ink-2` for body, `--ink-3` for labels and dates, `--ink-4` for placeholders and disabled-state text.

### Borders / hairlines

```css
--line-1:     rgba(15, 14, 23, 0.06);
--line-2:     rgba(15, 14, 23, 0.10);
--line-mesh:  rgba(255, 255, 255, 0.35);
--line-inner: rgba(255, 255, 255, 0.6);   /* inner highlight on frosted cards */
```

Hairlines are barely there. Never use 1px solid black or grey for borders.

### Semantic colors (muted, never screaming)

```css
--pos:      #1FA971;   /* gains, savings, "under budget" */
--pos-soft: #E6F7EF;
--neg:      #E64545;   /* overspend, "over budget" */
--neg-soft: #FCEBEB;
--warn:     #E5A03A;   /* "on track to overrun" */
--warn-soft:#FBF1DF;
--info:     #3E6DF0;
--info-soft:#E8EEFE;
```

Semantic colors are **desaturated by intent**. Gasti never shouts "ganancia!" or "pérdida!" — it states it. Use them on small surfaces (the amount in a transaction row, a budget-progress bar, a tiny status pill), not as full-card washes.

### Selection

```css
::selection { background: var(--ai-violet-soft); color: var(--ai-violet-ink); }
```

---

## Typography

### Families

- **Geist** — display and body. Loaded from Google Fonts. Bold (700) for headlines, semibold (600) for titles, regular (400) for body.
- **Geist Mono** — all numerics. Tabular figures enabled.
- **Instrument Serif** italic — one-off editorial moments only (a single empty-state line, the landing-chat tagline). Used at most once per screen, often zero times.

System fallbacks: `ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif` for sans; `ui-monospace, 'SF Mono', Menlo, monospace` for mono.

### Scale (mobile-first, generous line-height)

```
--t-display-xl: 700 44px / 1.04  Geist     /* hero headline */
--t-display-lg: 700 36px / 1.08  Geist
--t-display-md: 600 28px / 1.14  Geist     /* minimum size for display type */
--t-title-lg:   600 22px / 1.25  Geist
--t-title-md:   600 18px / 1.32  Geist
--t-title-sm:   600 16px / 1.36  Geist

--t-body-lg:    400 17px / 1.5   Geist
--t-body:       400 15px / 1.5   Geist
--t-body-sm:    400 13px / 1.45  Geist

--t-label:      500 12px   / 1.3   Geist
--t-label-tiny: 500 10.5px / 1.3   Geist

--t-num-xl:     600 40px / 1.05  Geist Mono   /* focal number per screen */
--t-num-lg:     600 28px / 1.1   Geist Mono
--t-num-md:     500 18px / 1.2   Geist Mono
--t-num-sm:     500 14px / 1.2   Geist Mono
```

### Tracking

```
--tracking-tight:    -0.022em   /* display type */
--tracking-normal:   -0.005em   /* default body */
--tracking-label:     0.04em
--tracking-eyebrow:   0.14em    /* small uppercase labels above sections */
```

### Numeric rendering

Every number on screen uses Geist Mono with tabular and lining figures:

```css
.num    { font: var(--t-num-md); font-feature-settings: 'tnum' 1, 'lnum' 1; color: var(--ink-1); }
.num-xl { font: var(--t-num-xl); font-feature-settings: 'tnum' 1, 'lnum' 1; color: var(--ink-1); letter-spacing: var(--tracking-tight); }
.num-lg { font: var(--t-num-lg); font-feature-settings: 'tnum' 1, 'lnum' 1; color: var(--ink-1); letter-spacing: var(--tracking-tight); }
```

Currency symbol (`$`) is part of the number, never floating in a separate label. Negative amounts: `−$1.234,56` (using the proper minus glyph U+2212, not hyphen). Positive deltas: `+12,5%`. Always show the sign for deltas, never for absolute amounts.

### Headline rules

- Never set display type smaller than 28px.
- Tracking is tight (`--tracking-tight`), line-height is loose (1.04–1.14). Headlines breathe.
- Sentence case. No Title Case.

### Editorial italic

Reserved for at most one short phrase per screen, never inside a working surface. Class: `.editorial` (`font-family: Instrument Serif; font-style: italic; font-weight: 400`).

---

## Spacing & radii

### Spacing scale

```
--s-1:  4px
--s-2:  8px
--s-3:  12px
--s-4:  16px
--s-5:  20px
--s-6:  24px
--s-7:  32px
--s-8:  40px
--s-9:  56px
--s-10: 72px
```

- The *minimum* breathing margin around any card is **16px**; the *default* is **20–24px**.
- Cards never touch each other — they always have at least **12px** of air, and cluster vertically with **16px** gaps.
- Page gutters are **20px** on small viewports, **24–32px** on desktop. Scrolling regions never go edge-to-edge.

### Corner radii (the silhouette of the brand)

```
--r-xs:   6px      /* toggles, micro-badges */
--r-sm:   10px     /* small cards, segmented controls */
--r-md:   14px     /* list rows, suggestion chip icon-tiles */
--r-lg:   20px     /* DEFAULT card — memorize this silhouette */
--r-xl:   28px     /* hero card, sheet */
--r-2xl:  36px     /* oversized hero */
--r-pill: 999px    /* every button, every chip, every input */
```

Sharp corners are **forbidden** anywhere a finger or cursor could land. The 20px default card silhouette is the silhouette of the brand — deviation requires a reason.

---

## Elevation, blur, motion

### Elevation (soft and floaty, never crisp drop-shadow)

```
--e-0: none
--e-1: 0 1px 2px rgba(15,14,23,0.04), 0 1px 1px rgba(15,14,23,0.03)
--e-2: 0 4px 14px -6px rgba(15,14,23,0.10), 0 2px 4px rgba(15,14,23,0.04)
--e-3: 0 16px 40px -16px rgba(15,14,23,0.18), 0 4px 12px rgba(15,14,23,0.05)
--e-4: 0 30px 80px -28px rgba(48,42,120,0.32), 0 8px 24px rgba(15,14,23,0.06)
--e-glow-ai: 0 12px 36px -12px rgba(124,107,255,0.45)
```

- `--e-2` — cards in a list (default)
- `--e-3` — elevated / floating cards (active conversation card)
- `--e-4` — the AI assistant orb if used, hover state on the primary CTA
- `--e-glow-ai` — only the AI sparkle button or primary "Ask" composer

No `box-shadow` uses pure black. All shadows are tinted warm with `rgba(15,14,23,…)` so they sit warm.

### Blur (frosted glass surfaces)

```
--blur-1: blur(8px)  saturate(120%)    /* chips */
--blur-2: blur(18px) saturate(140%)    /* cards over mesh */
--blur-3: blur(32px) saturate(160%)    /* full sheets */
```

**When to use frost:**
- Yes — over the mesh background, when content overlaps a gradient
- Yes — a sticky composer over a scrolling list
- No — over a card that is already on white. Re-blurring an already-opaque surface looks cheap.

Frosted cards over mesh add an inner top highlight via `box-shadow: inset 0 1px 0 var(--line-inner)` for the "liquid glass" feel.

### Motion (slow, confident, premium)

```
--dur-fast:    140ms   /* press state, focus ring */
--dur-base:    260ms   /* default transition */
--dur-slow:    480ms   /* card expansion, sheet open */
--dur-ambient: 1200ms  /* gradient drifts, glow pulses */

--ease-out:    cubic-bezier(0.16, 1, 0.3, 1)      /* signature ease — slow-out, quick-settle */
--ease-in-out: cubic-bezier(0.83, 0, 0.17, 1)
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)  /* sparingly */
```

- Default transition is **260ms** with `--ease-out`.
- Card / sheet expansions are **480ms** with the same ease.
- Mesh drifts are **1200ms+** ambient loops — opacity-only or `translate`, never `scale` or `rotate`.
- `--ease-spring` is allowed **only** on the AI sparkle pulse. Buttons do not bounce.

### Hover & press

- **Hover** (where it applies, i.e., desktop): surface lifts `--e-2 → --e-3`. Nothing else changes color. No "darken on hover".
- **Press / active**: `scale(0.985)` for **140ms**. No ripple. No color darken.
- **Disabled**: `opacity: 0.32`. No greyed-out alternative color.
- **Focus**: 2px outline in `--ai-violet`, offset 2px. **Never** the blue browser default.

---

## Components

Components reference tokens by name. Concrete JSX implementations live in `apps/ui/components/` and follow the project's React-component conventions (per CLAUDE.md domain skills: `vercel-composition-patterns` + `vercel-react-best-practices`).

### Card (canonical)

```css
background:    var(--surface-0);
border:        1px solid var(--line-1);
border-radius: var(--r-lg);          /* 20px */
box-shadow:    var(--e-2);
padding:       var(--s-5) var(--s-5); /* 20px 20px */
```

**Variants:**

- **Lavender row** — used in stacked lists like "Sugerencias" or budget-progress rows. Swap background for `--surface-tint`, drop the shadow, keep the hairline border, keep `--r-lg`.
- **Frosted hero** — used over the mesh on the landing surface. Background `--surface-frost`, `backdrop-filter: var(--blur-2)`, inner top highlight via `box-shadow: inset 0 1px 0 var(--line-inner)`. Keep `--r-lg` or step up to `--r-xl` (28px).
- **AI suggestion row** — the rows on the landing surface that suggest prompts. Hairline border, **14px** icon tile in `--ai-violet-soft`, a right chevron in `--ink-3`, **14px** outer radius (`--r-md`), no shadow.

### AI chat surface

The conversation thread. Lives on white (`--surface-0`) once active; mesh only behind the initial empty state.

- **User message:** white card, right-aligned, **20px** radius, `--e-1` shadow, small "Vos" pill in `--surface-tint` with `--ai-violet-ink` label sitting above the message. Max-width ~480px. Body text `--t-body` in `--ink-1`.
- **Gasti message:** no card. Bare prose under a small eyebrow row: the 14px sparkle glyph in `--ai-violet` + the label "Gasti" in `--t-label`, uppercase, tracking `--tracking-eyebrow`, color `--ai-violet-ink`. Body text `--t-body-lg` in `--ink-1`. Max-width ~540px.
- **Tool-call trace** (per `PRODUCT.md`'s transparency requirement): rendered as a compact disclosure beneath the Gasti message. Eyebrow label "Tools" in `--t-label-tiny` + `--ink-3`. Each tool call is a hairline-bordered pill (`--r-pill`) with the tool name in `--font-mono`, **12px**, `--ink-2`, and the inputs in `--ink-3`. Clicking expands a nested view of the tool's input JSON in a `--surface-tint` card, monospaced.
- **Option pills** (when Gasti offers a structured choice — e.g., during a confirmation): stack vertically, each pill is a 14px-radius row, `--surface-tint` background, hairline border, label centered in `--ai-violet-ink`. Per `PRODUCT.md`, this is also the visual treatment for delete/edit confirmations.

### Suggestion chip (landing surface)

The home surface's "Pregunta algo" row list. Vertically stacked, max ~3–4 visible.

```
display:        flex; align-items: center; gap: 14px;
padding:        14px 16px;
background:     var(--surface-tint);
border:         1px solid var(--line-1);
border-radius:  var(--r-md);    /* 14px */
cursor:         pointer;
```

- **Icon tile** (left): 36×36, `--r-sm` (10px), `--ai-violet-soft` background, Lucide icon in `--ai-violet-ink` at 1.6px stroke, 18px size.
- **Label** (center, flex:1): `--t-title-sm` weight 500, `--ink-1`.
- **Chevron** (right): Lucide `chevron-right`, 16px, `--ink-3`.

**Canonical prompts** (es-AR; English variants follow same patterns):
- *¿Cuánto gasté en comida este mes?*
- *Mostrame los gastos de los últimos 30 días.*
- *¿En qué gasté más esta semana?*
- *Proyectá cómo termina el mes.*

### Transaction row

A list item inside a card (the outer card wraps a list of rows, `padding: 8px`, with hairline dividers between rows indented by the icon-tile width + gap).

```
display:       flex; align-items: center; gap: 14px;
padding:       12px 12px;
```

- **Glyph tile** (left): 36×36, `--r-sm` (10px). For merchants that have a real wordmark (rare in the dataset — none of Coto/Rappi/Uber/Edenor have a brand color we can guarantee), use a colored monogram tile (the merchant's first letter) on `--surface-tint` with `--ai-violet-ink` text. For category-only rows, use the Lucide glyph for the category (see Iconography below) on `--surface-tint`.
- **Title block** (center, flex:1):
  - Top line: merchant or description, `--t-title-sm` weight 600, `--ink-1`.
  - Bottom line: ISO date + time in `--t-label`, `--ink-3`, tracking `--tracking-label`. Format: `8 may, 9:10pm` (es-AR) or `May 8, 9:10pm` (en).
- **Amount block** (right, text-align: right):
  - Top: signed amount in `--t-num-sm`. Expenses in `--neg`, income in `--pos`. Currency symbol baked in. ARS formatting.
  - Bottom: category label in `--t-label`, `--ink-3`, tracking `--tracking-label`. Capitalize first letter only.
- **Divider:** 1px `--line-1`, indented 62px from the left (past the icon tile + gap).

### Buttons

All buttons are pill-shaped (`--r-pill`). Three variants:

**Primary** — used **once per screen** for the most important action.
```
padding: 14px 26px;
border:  none;
background: var(--brand-grad);
color: white;
font: var(--t-title-sm);
letter-spacing: var(--tracking-normal);
box-shadow: var(--brand-glow);
cursor: pointer;
```

**Secondary** — over white surfaces.
```
padding: 13px 22px;
border: 1px solid var(--line-2);
background: var(--surface-0);
color: var(--ink-1);
font: 600 14px var(--font-display);
```

**Frosted secondary** — over the mesh background only.
```
padding: 13px 24px;
border: 1px solid rgba(255,255,255,0.5);
background: rgba(255,255,255,0.55);
backdrop-filter: var(--blur-2);
color: var(--ink-1);
font: 600 14px var(--font-display);
```

**Text / "ghost" button** — for low-emphasis links.
```
padding: 10px 14px;
background: transparent;
color: var(--ai-violet-ink);
font: 600 14px var(--font-display);
```

(Includes inline arrow: `Ver todo →`.)

**Forbidden:**
- Solid red destructive buttons (`--neg` as background). Confirm destructive actions with conversation, not color.
- Buttons that bounce on press.
- Color-darken on press. Use scale(0.985) instead.

### Composer ("Pregúntame lo que quieras")

The text-input surface where the user types to Gasti. Sits at the bottom of the chat surface, sticky on scroll, frosted when overlapping the mesh.

```
display: flex; align-items: center; gap: 12px;
padding: 12px 14px;
background: var(--surface-frost);
backdrop-filter: var(--blur-2);
border: 1px solid var(--line-mesh);
border-radius: var(--r-pill);
box-shadow: var(--e-3);
```

- **Input** (flex:1): borderless, transparent background, `--t-body` in `--ink-1`. Placeholder in `--ink-4`: *"Pregúntame lo que quieras"* / *"Ask me anything"*.
- **Send button** (right): 36×36 circle (`--r-pill`), `--brand-grad` background, `--brand-glow` shadow, sparkle glyph in white, **18px**. Pressing scales 0.985 for 140ms.
- **State while Gasti is thinking:** the send button replaces its icon with a pulsing sparkle (`--ease-spring` 1200ms ambient loop). Placeholder swaps to *"Buscando..."* / *"Thinking..."*. Input is disabled.

### Inline numerics

Whenever a number appears in prose ("Gastaste **$45.300** en comida"), the number itself is wrapped in `.num` (or `.num-lg` for emphasis) — Geist Mono with tabular figures, currency baked in. The surrounding prose is regular Geist body.

For deltas: *"+$12.500 vs. abril"* — the sign and number live together in a single `.num` span, colored `--pos` or `--neg`.

### Budget progress (lavender row variant)

A canonical pattern when reporting "cómo voy con [category]".

```
- Lavender card (--surface-tint, --r-lg, 1px --line-1, no shadow)
- Padding: 16px 20px
- Top row: category label (--t-title-sm, --ink-1) + spent/budget pair right-aligned in --t-num-sm
- Bar: 6px high, --r-pill, background --surface-3, fill in --pos / --warn / --neg depending on % remaining
- Optional caption below: --t-label, --ink-3, e.g., "Proyectado: $58.000 a fin de mes"
```

Color logic for the bar fill:
- `--pos` (green) when projection ≤ budget × 0.85
- `--warn` (amber) when 0.85 < projection ≤ 1.0
- `--neg` (red) when projection > 1.0

The bar always animates from 0 to its current value on first render (260ms, `--ease-out`).

---

## Layout

Gasti is desktop-first responsive web. There is no mobile UI kit shipped, but every component should behave gracefully at narrow viewports.

### Page structure

- **Top region** — small header with the Gasti wordmark on the left, settings/help affordance on the right. ~56px high. Sits over white on working screens; over a frosted strip when on the landing/hero surface.
- **Main region** — the conversation thread or the focused-work surface. Max content width **720px**, centered, with **24–32px** gutters at wide viewports and **20px** at narrow.
- **Composer region** — sticky at the bottom of `main` when in the chat. Has its own internal max-width (matches the content column).

### Surface assignments

- **Landing / first message** — mesh background, frosted hero card with the greeting line and the AI suggestion rows.
- **Active conversation** — white (`--surface-0` for messages, `--surface-1` for the page).
- **Settings / budget overview / transaction list** — `--surface-1` page, cards on `--surface-0`.
- **Modals / sheets** — white card on dimmed-mesh scrim (`rgba(15,14,23,0.18) + --blur-1`), `--r-xl` radius, `--e-4` shadow.

### Responsive rules

- Below 640px: single column, 16px gutters, suggestion chips fill width, send button stays 36×36.
- 640–1024px: single column, 24px gutters, content stays ≤ 720px.
- ≥1024px: single column, 32px gutters, content max-width 720px (the conversation never goes wider than reading-comfortable).

There is no two-column layout in v1. The product is a chat — a chat is a column.

### One focal number per screen

A surface has at most **one** `--t-num-xl` (40px Geist Mono) per screen. All other numbers step down. This is a content rule masquerading as a layout rule — it prevents numerics fighting each other for attention.

---

## Iconography

**Library: Lucide.** Loaded via CDN (`https://unpkg.com/lucide@latest`) or installed as `lucide-react` in `apps/ui`. Rendered monochrome at **1.5px stroke**, **20px** default size, **24px** in nav-style affordances.

**Color rules:**
- `--ink-1` for active / primary icons
- `--ink-3` for secondary / inactive
- `--ai-violet` **only** when the icon represents AI (the sparkle, magic wand, assistant-chip tiles)
- `--brand-indigo` for the icon inside the single primary CTA

**Category glyphs** (for transaction rows and budget cards, mapped from the dataset's categories):

| Category | Lucide icon | Note |
|---|---|---|
| `comida` | `utensils` | |
| `transporte` | `bus` | |
| `entretenimiento` | `clapperboard` | |
| `salud` | `heart-pulse` | |
| `servicios` | `plug` | utilities, telcom |
| `educacion` | `graduation-cap` | |
| `otros` | `more-horizontal` | |

The mapping is the v1 commitment; new categories added via override/edit get a fallback `tag` icon until mapped.

**AI sparkle (signature).** A custom 4-point star — the brand-distinct AI marker, used in place of Lucide's `sparkles` in every "this is AI" placement. Inline SVG (the asset lives in `apps/ui/public/sparkle.svg`):

```html
<svg width="14" height="14" viewBox="0 0 64 64" fill="#7C6BFF">
  <path d="M32 4 C 33 18, 34 22, 38 26 C 42 30, 46 31, 60 32 C 46 33, 42 34, 38 38 C 34 42, 33 46, 32 60 C 31 46, 30 42, 26 38 C 22 34, 18 33, 4 32 C 18 31, 22 30, 26 26 C 30 22, 31 18, 32 4 Z"/>
</svg>
```

**Forbidden:** emoji as primary icons. Unicode arrows (`→`, `↗`, `↘`) are allowed inline in numeric deltas only.

---

## Wiring into apps/ui

This section is normative for the implementation plan — it tells the plan exactly where the design system lives in code.

1. **Tokens CSS** — `apps/ui/app/globals.css` imports the Google Fonts URL and declares every `--*` variable in `:root`. The full variable list above is copied verbatim from the source's `colors_and_type.css` (renamed only if a name collides with Tailwind defaults).
2. **Tailwind theme bridge** — `apps/ui/tailwind.config.ts` extends `theme.colors`, `theme.borderRadius`, `theme.spacing`, `theme.boxShadow`, `theme.fontFamily` to reference the CSS variables (e.g., `colors: { surface: { 0: 'var(--surface-0)', tint: 'var(--surface-tint)' }, ink: { 1: 'var(--ink-1)' } }`). Tailwind utilities then read tokens by semantic name (`bg-surface-0`, `text-ink-1`), and the tokens stay in CSS as the single source of truth.
3. **Sparkle asset** — `apps/ui/public/sparkle.svg` (the SVG above). Referenced from a `<Sparkle>` React component in `apps/ui/components/icons/`.
4. **Mesh background** — implemented as a CSS class (not an image): `.bg-mesh { background: var(--mesh-ambient); }`. Applied only to hero surfaces.
5. **Component organization** — feature-first per CLAUDE.md. A "design-system" feature folder (`apps/ui/components/` with `Card`, `Button`, `Composer`, `SuggestionChip`, `TransactionRow`, `BudgetProgress`, `Sparkle`) is acceptable since these components are cross-cutting UI primitives, not feature logic.

Concrete tasks for wiring (Tailwind config edits, file copies, asset placement) belong in the implementation plan — they are not decided here. This document is the spec; the plan turns it into commits.

---

## Out of scope

The following elements from the Wealthy AI source are explicitly **not** brought across:

- **Mobile UI kit (`ui_kits/wealthy-mobile/`).** Gasti is web. The JSX in the source is reference-only — copy the visual rules, not the JSX.
- **iPhone frame / status bar / tab bar.** No mobile chrome.
- **Investment components.** Buy/Sell buttons, portfolio donut chart, holdings cards, "Start investing" surface, asset-class glyphs (`trending-up`, `coins`, `landmark`, `building-2`, `bitcoin`).
- **Brand-mark glyphs for stocks.** Apple/Tesla/Reliance/etc. wordmarks are investment-domain. Gasti's transaction merchants get monogram tiles or category glyphs instead.
- **"Wealthy" character voice.** No first-person product voice ("I'm Gasti", "Let me check"). No exclamation marks. No greeting line that names the product.
- **Dark mode.** Not in v1.
- **Hand-drawn illustration, photography, textures.** None.
- **Marketing / landing page.** Gasti is the chat itself — there is no separate marketing surface in v1.
- **Onboarding wizard.** No first-run flow (consistent with `PRODUCT.md`).
- **Voice / mic interaction UI.** Source includes a mic-recording bloom; Gasti is keyboard-only in v1.

---

## References

- **Source design system:** Wealthy AI Design System (Claude Design handoff bundle), inspired by *Wealthy — AI-Powered Personal Finance Assistant* by Jatin Lathiya on Dribbble.
- **Adjacent fintech grammar:** Apple Wallet, Wealthfront, Revolut, Cash App.
- **Editorial calm reference:** Linear, Arc, Notion AI.
- **Ambient palette reference:** Headspace.
- **Token source file:** `colors_and_type.css` from the source bundle (variables transposed into this document verbatim; canonical at `apps/ui/app/globals.css` once wired).
- **Font sources:** Geist + Geist Mono + Instrument Serif from Google Fonts CDN.
- **Icon source:** Lucide (`lucide-react` package in `apps/ui` or CDN).
- **Companion document:** `PRODUCT.md` (product domain, user, constraints — what Gasti does; this document covers how it looks).
