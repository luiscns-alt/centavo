# Design System — Centavo

## Product Context
- **What this is:** Privacy-first personal cash flow tracker PWA. Offline, no backend, no bank linking.
- **Who it's for:** A developer tracking salary, freelance income, dividends, and day-to-day expenses.
- **Space/industry:** Personal finance / personal productivity tools.
- **Project type:** Mobile-first PWA (installable on phone home screen).
- **Primary metric:** "Saldo Livre" (Free Balance) = Total Income − Total Expenses for the current month.
- **Currency:** BRL (R$). Amounts stored as integers (centavos). Display via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

## Aesthetic Direction
- **Direction:** Warm Minimal
- **Decoration level:** Minimal — typography does the work. No gradients, no decorative blobs, no icon-in-colored-circle patterns.
- **Mood:** Feels like a well-designed personal notebook. Precise and crafted, not enterprise fintech. Personal and opinionated, not generic. Color only appears where it means something financial.
- **What we're NOT doing:** Cold developer-grey, trust-blue fintech, gamification, dashboard maximalism with 5+ widgets.

## Typography
- **Display/Hero:** `Instrument Serif` — for the Saldo Livre number only. Gives the primary metric weight and gravity. Reads as a verdict, not a data point.
- **Body/UI/Labels:** `Plus Jakarta Sans` — all other text. Clean, slightly calligraphic terminals that echo Instrument Serif without clashing.
- **Amounts in lists:** `Plus Jakarta Sans` with `font-variant-numeric: tabular-nums lining-nums` — no third font. Numbers align in transaction rows without needing a dedicated monospace.
- **Code:** Not applicable (no code display in this app).
- **Loading:** Google Fonts CDN.

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type Scale
| Role | Font | Size | Weight | Notes |
|------|------|------|--------|-------|
| Hero balance | Instrument Serif | 44px | Regular | Saldo Livre number only |
| Screen title | Plus Jakarta Sans | 17px | 600 | |
| Body | Plus Jakarta Sans | 15px | 400 | |
| Transaction amount | Plus Jakarta Sans | 15px | 700 | tabular-nums lining-nums |
| Label / caps | Plus Jakarta Sans | 11px | 600 | uppercase, letter-spacing: .1em |
| Caption / muted | Plus Jakarta Sans | 12px | 400 | color: --muted |

## Color
- **Approach:** Semantic only. Color only appears to indicate financial direction. No accent buttons, no colored nav chrome, no colored UI decoration.
- **Background:** `#F7F5F1` — warm off-white (aged paper, not sterile white). Signals "personal tool" not "banking app."
- **Surface (cards):** `#FFFFFF`
- **Text primary:** `#1A1816` — warm near-black
- **Text muted:** `#6B6560`
- **Border / dividers:** `#E8E4DF`
- **Income / positive:** `#2D6A4F` — deep emerald green
- **Income light (backgrounds):** `#EBF5F0`
- **Expense / negative:** `#9B2335` — wine/burgundy (reads "serious", not "alarm")
- **Expense light (backgrounds):** `#F9EEF0`
- **Dark mode:** Invert surfaces — `#1A1816` bg, `#2A2724` surface, `#F7F5F1` text, `#9B948F` muted, `#3A3532` border. Reduce income/expense saturation ~15% for dark backgrounds.

### Tailwind Color Extension
```js
// tailwind.config.js — extend.colors
{
  bg: '#F7F5F1',
  ink: '#1A1816',
  muted: '#6B6560',
  border: '#E8E4DF',
  surface: '#FFFFFF',
  income: '#2D6A4F',
  'income-light': '#EBF5F0',
  expense: '#9B2335',
  'expense-light': '#F9EEF0',
}
```

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable (not cramped on mobile, not airy — this is a daily-use tool)
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)
- **Content padding (mobile):** 18–20px horizontal

## Layout
- **Approach:** Mobile-first, grid-disciplined
- **Max content width:** 480px (centered on desktop — this is a phone app, not a dashboard)
- **Grid:** Single column on mobile. No sidebar.
- **Navigation:** Bottom nav, 4 tabs (Home, Transactions, + FAB, Settings). Icons only on mobile — no labels.
- **Border radius:** sm(6px) md(9–10px) lg(12px) full(9999px for chips/badges)
- **Hero section:** Full-bleed top section with month selector → Saldo Livre number → Income/Expense sub-cards

## Motion
- **Approach:** Minimal-functional only. Every animation aids comprehension, nothing decorative.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50–100ms) short(150–200ms) medium(250–350ms)
- **Specific animations:**
  - Month switch: subtle horizontal slide (150ms, ease-in-out)
  - Transaction save: card slides up from bottom (200ms, ease-out)
  - Balance number: none (immediate — don't animate the primary metric)
  - Bottom nav tab switch: immediate

## Component Patterns

### The Hero Balance Card
The most important element in the app. Rules:
- Label "SALDO LIVRE" in caps, muted, above the number
- Number in Instrument Serif, 44px
- Positive balance: `color: income (#2D6A4F)`
- Negative balance: `color: expense (#9B2335)`
- Zero balance: `color: muted (#6B6560)`

### Transaction Rows
- Left: category emoji icon in a rounded square (28–32px), colored background (income-light or expense-light)
- Middle: description (font-weight 500) + category · date (muted, 11–12px)
- Right: amount (tabular-nums, 700 weight, income/expense color, + or − prefix)

### Buttons
- **Primary:** background `ink (#1A1816)`, text `bg (#F7F5F1)` — for save/confirm actions
- **Save expense:** background `expense (#9B2335)`, text white — when the form is in expense mode
- **Save income:** background `income (#2D6A4F)`, text white — when the form is in income mode
- **Secondary/ghost:** transparent, border `border (#E8E4DF)`, text `ink`
- Never use color for generic CTAs — only for financial-direction actions

### Category Chips (Add Transaction form)
- Unselected: `surface` background, `border` border, `muted` text
- Selected (expense): `expense-light` background, `expense` border and text
- Selected (income): `income-light` background, `income` border and text
- Scrollable horizontal row, filtered by current income/expense toggle

### Type Toggle (Income / Expense)
- Container: `border (#E8E4DF)` background, rounded
- Active option: `surface` background with subtle shadow, colored text (income or expense color)
- Inactive: transparent, `muted` text

## Optional Enhancement: Paper Grain on Hero Card
An SVG noise filter applied only to the Saldo Livre section gives the hero number a tactile, printed quality. Zero dependencies, works offline. Apply with 3–4% opacity — subtle, not visible as a texture.

```jsx
// In the SVG defs (can be in index.html or a root component)
<svg style={{ display: 'none' }}>
  <defs>
    <filter id="paper-grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      <feBlend in="SourceGraphic" mode="multiply" opacity=".04" />
    </filter>
  </defs>
</svg>

// On the hero balance container
<div style={{ filter: 'url(#paper-grain)' }}>
```

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-16 | Instrument Serif for hero number | Gives the primary metric weight and gravity; reads as a verdict not a data point |
| 2026-04-16 | #9B2335 (burgundy) for expense | Warmer, more serious than flat-UI red #C0392B; better contrast on #F7F5F1 |
| 2026-04-16 | Drop Geist, use Plus Jakarta Sans with tabular-nums | Eliminates a third font load; maintains warmth coherence; avoids Vercel/code-editor associations |
| 2026-04-16 | Plus Jakarta Sans over DM Sans | Slightly more calligraphic terminals pair better with Instrument Serif |
| 2026-04-16 | Color is purely semantic | No colored UI chrome — color only appears as income/expense indicators. Clarity over decoration. |
| 2026-04-16 | Warm off-white #F7F5F1 as base | Signals "personal ledger notebook" vs enterprise fintech. Distinct from every competitor in the category. |
| 2026-04-16 | Design system created by /design-consultation | Research: finance apps converge on blue, card-heavy dashboards. Centavo's opportunity: ledger not dashboard, warm not cold. |
