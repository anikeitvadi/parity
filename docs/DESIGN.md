# Design System & Style Guide

The canonical reference for UI work on this project — for a human or for Claude.
Match these tokens and component patterns; don't invent new colors, sizes, or
spacings. Everything here is extracted from the live code.

The source of truth for tokens is the `@theme` block in
[`web/src/app.css`](../web/src/app.css). Components are styled with Tailwind v4
utility classes inline (no CSS modules).

> **Working on this together (human or AI agents):** this file plus the `@theme`
> block in `app.css` are the **current ground truth** on `main`. If you're doing a
> design pass, base it on the live repo and propose changes as a **branch / PR** —
> a diff on top of this — rather than a parallel design system that has to be
> reconciled later. Everything below is extracted from real components; if you
> change a token, update both `@theme` **and** the components that use it so the two
> never drift.

---

## 1. Principles

- **Data-dense terminal, not a marketing site.** Compact rows, small type, tight
  spacing. Information per pixel is high on purpose.
- **Dark, near-black surface** with low-chroma slate neutrals; color is reserved
  for meaning (accent, up/down, warning).
- **Numbers are monospaced and tabular** so columns line up and don't jitter.
- **Restraint.** Most of the UI is greyscale; one cyan accent carries
  interactivity. A second color only appears when it means something.
- **Honest states.** Empty/thin/loading states say what's true (skeletons,
  "Calibration starts after 5 resolved calls") rather than faking content.

---

## 2. Color tokens

Defined in `@theme` and used everywhere. Prefer the **semantic name**; the hex is
what's currently hardcoded in components (see [§9](#9-known-inconsistency--migration)).

| Token | Hex | Tailwind v4 utility | Use for |
|---|---|---|---|
| `surface` | `#020617` | `bg-surface` | App background, table header bg, deepest layer |
| `card` | `#0E1223` | `bg-card` | Panels, cards, rows (hover/selected), inputs bg |
| `card-hover` | `#141A2E` | `bg-card-hover` | Card hover state |
| `border` | `#1E293B` | `border-border` | All hairline borders, dividers |
| `border-hover` | `#334155` | `border-border-hover` | Hover borders, scrollbar thumb, plot gridlines |
| `text` | `#F8FAFC` | `text-text` | Primary text, headings, key numbers |
| `text-secondary` | `#94A3B8` | `text-text-secondary` | Labels, secondary copy |
| `text-muted` | `#64748B` | `text-text-muted` | Captions, column headers, placeholders, "·" |
| `accent` | `#06B6D4` | `text-accent` | Interactive: links, selected, primary action, signal dot |
| `accent-hover` | `#22D3EE` | `bg-accent-hover` | Accent hover; bright cyan in charts |
| `positive` | `#22C55E` | `text-positive` | Up / yes / well-calibrated / good |
| `negative` | `#EF4444` | `text-negative` | Down / error / "beats-fees" / detector line |
| `warning` | `#F59E0B` | `text-warning` | Urgency (closing soon), fees line, miscalibration |

**Extended / contextual colors** (used inline, not yet tokenized):

| Hex | Use |
|---|---|
| `#CBD5E1` / `#E2E8F0` | Slightly dimmer/brighter text (e.g. neutral queue prices, indented rows) |
| `#475569` | Scrollbar thumb hover |
| `#334155` | Disabled/"--" placeholder text, dashed plot baselines |
| `#8B5CF6` | Cross-platform reference (violet) in the price sparkline |
| `#064E3B` + `#6EE7B7` | "Done" status badge (bg + text) |
| `blue-500/10` + `blue-400` | **Polymarket** badge |
| `violet-500/10` + `violet-400` | **Kalshi** badge |
| `slate-500/10` + `slate-400` | **Mixed**-platform badge |

### Color-usage rules

- **Cyan (`accent`) = "you can act on this"** — links, the selected row's left
  border, primary buttons, the real-signal dot. Don't use cyan decoratively.
- **Green/red = direction**, not chrome. Reserve for up/down, yes-likely, P&L,
  calibration hit/miss. Queue prices are intentionally **neutral** (`#E2E8F0`) to
  avoid a wall of red longshots.
- **Amber = attention**: closing-soon time, the 9pp fee line, calibration error.
- **Threshold ramp** (Efficiency Lab): `3pp` cyan `#22D3EE` → `9pp` amber
  `#F59E0B` → `19pp` red `#EF4444`. Cheaper→costlier reads left→right, cool→hot.

---

## 3. Typography

- **Sans:** `IBM Plex Sans` (`--font-sans`) — all prose/labels.
- **Mono:** `IBM Plex Mono` (`--font-mono`) — **all numbers**, tickers, prices,
  volumes, timestamps. Pair with `tabular-nums` for alignment.

Type scale (every size is an explicit `text-[Npx]`; stay on this ladder):

| Class | px | Use |
|---|---|---|
| `text-[22px]` | 22 | Headline stat numbers (`Stat` value) |
| `text-[18px]` | 18 | (reserved — large headings) |
| `text-[16px]` | 16 | Page/section title (e.g. "Market Efficiency Lab") |
| `text-[13px]` | 13 | Sub-headings, emphasized values |
| `text-[12px]` | 12 | **Body default** — rows, brief text, inputs |
| `text-[11px]` | 11 | Secondary copy, labels, buttons |
| `text-[10px]` | 10 | Captions, column headers, chips, chart text |
| `text-[9px]` | 9 | Badge text (platform, status, numbered steps) |
| `text-[7px]` | 7 | Logo mark only |

Weights: `font-semibold` (600) for headings/values/badges, `font-medium` (500)
for buttons/labels, normal otherwise. Column headers use `uppercase tracking-wider`.

---

## 4. Layout, spacing & shape

- **Radius:** `rounded` (4px) for chips/buttons/inputs/rows; `rounded-md` (6px)
  for cards/panels; `rounded-full` for dots, the numbered step, slider thumb.
- **Borders:** always `1px` in `border` (`#1E293B`). Selected list row uses a
  `border-l-2` in `accent`.
- **Density:** rows are `px-2 py-[5px]`; cards `p-2.5`–`p-3`; page padding `p-4`–`p-5`.
  Gaps between controls `gap-0.5`–`gap-2`.
- **App shell:** full-height flex column.
  - Global header: `h-7` bar, `border-b`.
  - Sub-toolbar (Scanner): `h-8` bar, `border-b`, `bg-card`.
  - Two-pane body: left list `w-[560px] shrink-0 border-r` + scroll; right pane
    `flex-1 min-w-0`.
- **Scrollbars:** 6px, transparent track, `#334155` thumb (`app.css`).

---

## 5. Component catalog

Each entry is the canonical class string. Copy these; don't re-derive.

### Panel / card
```
border border-[#1E293B] rounded-md p-3 bg-[#0E1223]
```
Deepest container (e.g. the chart panel) uses `bg-[#020617]`.

### Stat (headline number) — `LabPage`
```html
<div class="border border-[#1E293B] rounded-md px-4 py-3 bg-[#0E1223]">
  <div class="text-[22px] font-semibold text-[#F8FAFC] tabular-nums leading-none">2,219</div>
  <div class="text-[11px] text-[#94A3B8] mt-1.5">Live markets scanned</div>
  <div class="text-[10px] text-[#64748B] mt-0.5">Poly 1,500 · Kalshi 719</div>
</div>
```

### Badges
**Platform** (fixed width, used in rows):
```
w-10 text-center text-[9px] font-semibold rounded px-1 py-0.5 bg-blue-500/10 text-blue-400   // POLY
… bg-violet-500/10 text-violet-400   // KAL
… bg-slate-500/10 text-slate-400     // MIX
```
**Status** (uppercase pill):
```
text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded
  done:    bg-[#064E3B] text-[#6EE7B7]
  running: bg-[#1E293B] text-[#94A3B8]
```

### Segmented / filter button — toolbar
```
px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors
  active:   bg-[#1E293B] text-white
  inactive: text-[#64748B] hover:text-[#94A3B8]
```

### Buttons
```
// Primary (outline-accent) — "Generate Brief"
w-full py-2 text-[11px] font-medium text-[#06B6D4] border border-[#06B6D4]/30 rounded hover:bg-[#06B6D4]/10 transition-colors

// Primary (filled-accent) — "Log Forecast"
py-1.5 bg-[#06B6D4] hover:bg-[#22D3EE] text-[#020617] text-[11px] font-medium rounded transition-colors

// Secondary / ghost — "Save", "Thesis"
px-3 py-1.5 text-[11px] rounded border border-[#1E293B] text-[#64748B] hover:text-[#F8FAFC] transition-colors
  toggled-on: bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/30
```

### Input — search
```
bg-transparent border border-[#1E293B] rounded px-2 py-0.5 text-[12px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#06B6D4]
```

### Table — header / row / group / signal dot — `OpportunityQueue`
```
// header
sticky top-0 z-10 flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-[#64748B] bg-[#020617] border-b border-[#1E293B]

// row
flex items-center gap-1 px-2 py-[5px] cursor-pointer transition-colors border-l-2
  selected: bg-[#0E1223] border-[#06B6D4]
  default:  border-transparent hover:bg-[#0E1223]/60

// column widths: price w-10 (right) · market flex-1 · plat w-10 · vol w-12 (right) · close w-9 (right) · dot w-3
// numbers: font-mono tabular-nums; price text-[#E2E8F0]; vol/close/muted text-[#64748B]

// group row: caret ▸/▾ in the price slot; title text-[#F8FAFC] font-medium + summary line text-[10px] text-[#64748B]
// expanded member rows: same row class + indent (pl-4) and text-[#CBD5E1]; show only the outcome label

// real-signal dot (only when a market has cross-platform/Metaculus/divergence):
w-1.5 h-1.5 rounded-full bg-[#06B6D4]
```

### Numbered workflow card — `DecisionPane` empty state
```html
<div class="border border-[#1E293B] rounded-md p-2.5 bg-[#0E1223]">
  <div class="flex items-center gap-1.5 mb-1">
    <span class="w-4 h-4 rounded-full bg-[#1E293B] text-[#94A3B8] text-[9px] font-semibold flex items-center justify-center">1</span>
    <span class="text-[11px] font-semibold text-[#F8FAFC]">Scan</span>
  </div>
  <p class="text-[10px] text-[#64748B] leading-relaxed">…</p>
</div>
```

### Calibration bar — `DecisionPane`
```
track:     relative h-1.5 bg-[#1E293B] rounded-full
fill:      absolute inset-y-0 left-0 rounded-full  (≤10pp error: bg-[#22C55E], else bg-[#F59E0B])  width = actual%
predicted: absolute inset-y-[-2px] w-0.5 bg-[#06B6D4]  left = predicted%
```

### Sources-used link — `DecisionPane`
```
block text-[11px] text-[#06B6D4] hover:underline truncate
  + domain suffix: text-[#64748B]
```

### Empty / loading
```
// skeleton
h-7 bg-[#0E1223] rounded animate-pulse
// empty
flex items-center justify-center h-full text-[12px] text-[#64748B]
```

### Observable Plot theme — `LabPage`
```js
const PLOT_STYLE = {
  background: 'transparent',
  color: '#94A3B8',
  fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
  fontSize: '10px',
};
// threshold rules:  3pp #22D3EE · 9pp #F59E0B · 19pp #EF4444  (dashed '3,3', strokeOpacity ~0.7–0.8)
// dots: below fee line #22D3EE · beats fees #EF4444 · stroke #020617 · r-range [4,15], size = volume
// gridlines #1E293B; axis labels #64748B
```

---

## 6. Iconography & glyphs

No icon library. The UI uses text glyphs only:
- `▸` / `▾` — collapsed / expanded group.
- `·` — separator and empty-cell placeholder.
- `•` (a `rounded-full` span) — the real-signal dot and legend swatches.
- `×` — remove (saved markets).
- `↑` / `→` — axis direction labels in charts.

Keep it this way; adding an icon set would break the terminal feel.

---

## 7. Motion

Only `transition-colors` on interactive elements, and `animate-pulse` for
skeletons / the streaming cursor. No layout/transform animations.

---

## 8. Voice (microcopy)

Lowercase, terse, honest. Numbers carry the message; words frame them. State limits
plainly ("single reproducible scan", "Calibration starts after 5 resolved calls",
"No external sources retrieved"). Never overclaim. See the [pivot narrative](./PORTFOLIO.md).

---

## 9. Known inconsistency & migration

The `@theme` block defines semantic tokens, but components currently hardcode the
**raw hex** (`text-[#F8FAFC]`) instead of the generated utilities (`text-text`).
Tailwind v4 auto-generates `bg-surface`, `text-text`, `text-text-secondary`,
`text-text-muted`, `border-border`, `text-accent`, `text-positive`, etc. from the
tokens.

**Recommendation for new code:** prefer the semantic utilities. A future cleanup
could codemod the existing hex → tokens (e.g. `#F8FAFC` → `text`, `#0E1223` →
`card`, `#1E293B` → `border`, `#06B6D4` → `accent`) so the palette lives in one
place. Until then, this guide maps every hex to its token so the two stay in sync.
