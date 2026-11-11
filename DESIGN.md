# Design System — Centavo

## Product Context
- **What this is:** Privacy-first personal cash flow tracker PWA. Offline, no backend, no bank linking.
- **Who it's for:** A developer tracking salary, freelance income, dividends, and day-to-day expenses.
- **Space/industry:** Personal finance / personal productivity tools.
- **Project type:** Mobile-first PWA (installable on phone home screen).
- **Primary metric:** "Disponível hoje" (cash accounts today) with the "sobra prevista" for the month. "Saldo Livre" (Total Income − Total Expenses of the month) is the month's metric, in the "O mês" section.
- **Currency:** BRL (R$). Amounts stored as integers (centavos). Display via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

## Aesthetic Direction
- **Direction:** Warm Minimal
- **Decoration level:** Minimal — typography does the work. No gradients, no decorative blobs, no icon-in-colored-circle patterns.
- **Mood:** Feels like a well-designed personal notebook. Precise and crafted, not enterprise fintech. Personal and opinionated, not generic. Color only appears where it means something financial.
- **What we're NOT doing:** Cold developer-grey, trust-blue fintech, gamification, dashboard maximalism with 5+ widgets.

## Typography
- **Display/Hero:** `Instrument Serif` — for the Início hero number (Disponível hoje) and the Orçamentos hero only. Gives the primary metric weight and gravity. Reads as a verdict, not a data point.
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
| Hero balance | Instrument Serif | 44px | Regular | Disponível hoje (Início) · Resta (Orçamentos) |
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

### Color tokens (Tailwind v4)
Tokens live in `src/index.css` › `@theme` as `--color-*` (bg, surface, ink, muted, border, income, income-light, expense, expense-light), with dark values swapped under `prefers-color-scheme: dark`. Use them as utilities (`text-expense`, `bg-ink/55`). The lint rule `architecture/tailwind-colors` rejects arbitrary colors (`text-[#…]`), Tailwind palette colors (`bg-red-500`, `text-black`) and unknown color names (typos); `white`, `transparent` and `current` are allowed.

### Variants
Components with states use Panda CSS atomic recipes (`cva` from `styled-system/css`): `button` and `chip` in `src/shared/ui/variants.ts`, plus local ones in `BudgetBar` and `TransactionRow`. A variant that doesn't exist, or a color that isn't a token, is a type error (`strictTokens`).

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable (not cramped on mobile, not airy — this is a daily-use tool)
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)
- **Content padding (mobile):** 18–20px horizontal

## Layout
- **Approach:** Mobile-first, grid-disciplined
- **Max content width:** 480px (centered on desktop — this is a phone app, not a dashboard)
- **Grid:** Single column on mobile. No sidebar.
- **Navigation:** Bottom nav, 5 slots (Início, Lançamentos, + FAB, Análises, Ajustes). Icons only on mobile — no labels. The + FAB sits in the center slot. On desktop (≥768px) a 232px sidebar replaces it: primary "Novo lançamento" button (shortcut N) above the four destinations.
- **Border radius:** sm(6px) md(9–10px) lg(12px) full(9999px for chips/badges)
- **Hero section:** Disponível hoje → sobra prevista → atalhos (see Component Patterns → Início)

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

### Início (home)
Answers "how am I doing today" — **above the fold is always today**, from one consistent read (`features/home/home.ts`); below the fold is the month in the selector.
1. **Hero — Disponível hoje** (Instrument Serif 44/52px, ink; expense only if negative): balance of cash accounts (no cards, no loans). Below it: "Sobra prevista em <mês>" = disponível − invoices due by month end − loan installments due by month end, with the breakdown in muted text.
2. **Atalhos**: Despesa · Receita · Transferir open the form in that mode; **Pagar fatura** (ink, filled) appears only when an invoice is overdue or due in ≤ 5 days.
3. **Atenção** (only when there is something; else one muted line "Tudo em dia"): up to 3 items, worst first — vencido (fatura/parcela) > estourado / conta negativa > fatura vence em ≤ 5 dias > orçamento ≥ 80%. Severe items in `expense` with an octagon icon; the rest ink. Each opens its screen.
4. **Cartões**: invoice to pay now per card (vence/venceu, available limit), total "a pagar".
5. Right column (desktop ≥1024px): **Orçamentos do mês**, (Metas, reserved), **Contas** (bank accounts + empréstimos + patrimônio; cards live in their own block).
6. **O mês** (lazy: own chunk, mounted near the viewport): month selector, then the month as a running total — **Saldo de <mês>** (28px bold) = sobra (or déficit) carried from earlier months + this month's result, with both shown underneath; then receitas/despesas, patrimônio chart, breakdowns. With an account filter it falls back to the plain Saldo livre (receitas − despesas), since transfers move money between accounts. The carry follows Saldo livre rules: opening balances of cash accounts + every earlier month's result; card purchases by invoice month; transfers never count.
The last summary is kept on the device and painted instantly on open (same day and filter only), then replaced by the live read.

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
- Order: curated built-ins, then the user's own categories (oldest first), "Outros" always last
- Last chip is "+ Nova" (dashed `muted` border) — opens an inline editor (emoji + name) that creates the category for the current type and selects it
- Categories are managed in Ajustes → Categorias: rename / change emoji any time; delete only when no transaction uses it

### Type Toggle (Income / Expense)
- Container: `border (#E8E4DF)` background, rounded
- Active option: `surface` background with subtle shadow, colored text (income or expense color)
- Inactive: transparent, `muted` text

### Accounts & Transfers
- **Accounts carry no financial color.** Account chips are neutral: unselected `surface`/`border`/`muted`, selected `ink` background with `bg` text. Account icons sit in a bordered `bg` square (not income/expense-light — an account is not a direction).
- **Transfers are neutral.** ⇄ icon on a `border` square, amount in `ink`. In "Todas as contas" no sign (the total doesn't change); filtered to one account, `+`/`−` relative to that account. The save button in Transferência mode is the generic `primary` (ink) — never income/expense colors.
- **Type toggle** has three options: Despesa (expense color) · Receita (income color) · Transferência (ink).
- **Negative balances are shown, never blocked:** account balances below zero use `expense` color with a "−" prefix; the form warns "Nubank ficará com −R$ X" under the save button.
- **Two different numbers:** *Saldo Livre* (month flow, income − expense; transfers never count) lives in Início → "O mês"; the hero is *Disponível hoje* (cash accounts). *Patrimônio* (sum of account balances, opening balances included) lives in the Contas card and the Evolução chart.
- **Bank logos:** when an account is linked to a known bank (src/features/accounts/banks/catalog.ts), its icon is the official logo on a **white tile** with a `border` hairline — white in dark mode too, like an app icon. This is the one sanctioned exception to "color only means money": brand color stays inside that tile. Without a bank, or if the file fails to load, the account's emoji tile is shown. Logos are local files in /public/banks — never fetched from a third party.
- **Bank picker:** the account name field suggests known banks as you type (name, alias or COMPE code). Picking one links the bank; an exact name/alias match links automatically with a ✕ to undo. Free text never links silently.
- **Account filter:** one pill ("Todas as contas ▾") next to the screen title on desktop / under the month selector on mobile; hidden until there are 2+ accounts.

### Credit cards
- **A card is an account of kind `credit`, shown under its bank** (Contas e cartões card: bank row, cards indented below with the invoice to pay now, its due date and the available limit). Tapping a card opens its screen; tapping a bank filters by the bank (account + cards).
- **Purchases** are entered with the total and a `−  N×  +` stepper (1–24); the preview under it reads "3× R$ 333,34 · 1ª na fatura de dez/2026 (vence 10/12)". When the first installment absorbs rounding: "1ª R$ 333,34 + 2× R$ 333,33".
- **Installments count in their invoice's month** (Saldo Livre, categories, Comparativo). In Lançamentos they sit under a group header "Fatura Nubank · vence 10 dez", not under the purchase day; each row shows "2/3 · compra 12 nov".
- **Card screen:** debt (future installments included) + limit bar in `ink`; a horizontal timeline of invoice tiles (month, total, status — Aberta/Fechada/Parcial/Paga/Vencida/Futura). Selected tile is `ink`. Status text is neutral except **Vencida** (`expense`).
- **Pagar fatura** is an `ink` button; the payment is a neutral transfer row ("+R$ X", ⇄). Copy under it: "Não conta como despesa — as compras já contaram."
- **Payment method chips** ("Pago com": Pix · Débito · Boleto · TED · Dinheiro) are neutral (`ink` when selected). On a card there is no method picker — it is always crédito. Início has a neutral "Despesas por forma de pagamento" breakdown (`ink` bars, never income/expense colors).
- **Editing:** every row in Lançamentos opens the same form in edit mode with a quiet "Excluir…" button and inline confirmation. A card installment opens its whole purchase.

### Loans & financing
- **A loan is an account of kind `loan`** whose balance is −saldo devedor. Listed in "Contas e cartões" under **Empréstimos** (debt in `expense` color, "parcela 9/345 · vence 10 dez · R$ X"); never offered as a source/destination of money in forms.
- **Contract + events, not 360 rows:** only the contract and what happened (release, payments, prepayments, statement adjustments) are stored, each with a snapshot of its split; the future is projected by `loanMath`. Events are append-only — only the last one can be undone.
- **Whole installment = expense** (user decision): amortization + fees in the loan's category (default "Financiamentos"), interest in "Juros e encargos". Note: for a loan whose money landed in the account and was spent, that spending also counted — the principal is counted twice in Saldo Livre by design.
- **Loan screen:** saldo devedor in Instrument Serif (it is the screen's verdict), `ink` progress bar, four figures (próxima, termina em, juros pagos, juros a pagar), savings line when prepayments exist. Primary `ink` "Pagar parcela N"; ghost "Antecipar / quitar" shows *Reduzir prazo* vs *Reduzir parcela* side by side (interest saved, new end/payment) before confirming. Schedule grouped by year in `<details>`, current year open; prepayments/adjustments appear as tinted rows between the installments around their date.
- **Prepayment rule shown in copy:** "Os juros do período até a data são pagos primeiro (pró-rata por dia); o resto abate o saldo." Prepaying on/after an unpaid due date is blocked — pay that installment first.

### Charts
Two charts, both hand-built SVG (no chart library — offline PWA, small bundle, full control of type and color).

- **Evolução (Início):** patrimônio — the running balance at the end of each month, including all history before the window and the accounts' opening balances (from their opening date). Filtered to one account it shows that account's balance, transfers included. One bar per month, last 6 months, from a zero baseline: positive = `income`, negative = `expense` + hatch. Months other than the selected one are dimmed to 35%; clicking a bar selects that month. One direct label at most (the selected month).
- **Comparativo (own tab):** grouped bars per month, Entradas left (solid `income`) and Saídas right (`expense` + hatch). 6 or 12 months ending at the selected month. Summary tiles above (média de entradas, média de saídas, melhor mês — averages count only months with transactions) and a table view below with totals.
- **Why the hatch:** #2D6A4F vs #9B2335 are clearly distinct for normal vision (ΔE 22) but collapse for deuteranopia (ΔE 4.3 light / 1.8 dark; target ≥ 8). Saídas therefore always carry a 45° stripe pattern (surface-colored lines at 55% over `expense`), and Entradas/Saídas keep fixed positions. Never rely on the two colors alone.
- **Marks:** bars max 26px wide, 2px surface gap between adjacent bars, 4px rounded data end, square baseline end. Grid lines dashed `border`; zero line solid `muted` at 45%.
- **Axes:** one y-axis only, compact pt-BR labels ("2,5 mil") in 11px `muted`; month labels 11px, every other one when columns are narrower than 30px.
- **Text:** values, labels and legends use text tokens (`ink`/`muted`); the colored mark beside them carries identity. Exception kept from the ledger: signed Saldo values in tables use `income`/`expense` with +/− prefixes.
- **Interaction:** every month column is a hover/focus/tap target larger than its bars; tooltip lists the month's values with swatches. Filters (period) sit in one row above the chart, legend on the same row.
- **Dark mode:** same tokens — the chart reads `--color-*`, so it follows the dark palette automatically.
- **Comparativo → Cartões de crédito** (below the Entradas × Saídas table; rendered only when a card is in scope — no empty state; a filter that excludes every card hides it):
  1. *Peso do cartão nas saídas* — stacked columns per month: each card's invoice is its own hatched `expense` segment (split from the next by a 2px surface hairline, no per-card colors), "outras formas" on top as an `expense` tint (32%). One callout on the latest month ("28%"). The tint is below 3:1 on the surface, so a legend and a "Ver valores" table are mandatory.
  2. *Faturas a pagar* — total still owed across cards as the headline number, then one hatched column per invoice month (sum of all cards; per-card split only in the tooltip). No income reference line (user decision: income is too irregular to be a fair baseline).
  3. *Seus cartões · fatura a pagar* — one row per card with a horizontal hatched bar whose length is the invoice total relative to the largest card; paid invoices at 40% opacity.

### Categories (two levels)
- A category may have one parent of the same type (`parentId`); only two levels. A parent's totals include its children. Chips in the form list children right after their parent with a muted `↳`.
- Ajustes → Categorias: children indented with `↳`; `+` on a parent creates a subcategory; the editor's "Dentro de" moves a category (not one that has children). A one-time, dismissible suggestion offers Mercado→Alimentação, Assinaturas→Entretenimento, Cuidados pessoais→Saúde.

### Refunds (estornos)
- A refund is money back for an expense: it lowers that category's spending (and its budget), **never income**. Rows show a neutral tile, `+` amount in **ink** (not green), subtitle "Estorno". They sit under the Despesas filter.
- Created from the original's edit screen (panel "Estornos": list, "Estornar", total ≤ original). On a card, the refund is a credit on the invoice open at its date ("Crédito na fatura de …"). A refund row opens read-only with "Excluir estorno".

### Análises → Orçamentos
- The nav tab is **Análises** with a segmented control: Comparativo | Orçamentos (choice remembered). Orçamentos is always global (no account filter).
- Monthly limit per expense category: versions "a partir de <mês>" + one-off "só em <mês>" exceptions. Card installments count in the invoice month; refunds give back.
- **No traffic-light colors.** Bar states: ok → neutral ink bar; ≥80% → `expense` bar + ⚠ icon + "88% usado"; over 100% → `expense` up to the limit + striped (`.bar-hatch`) overflow + "Estourou R$ X". Status is always also in words. Current month shows a small surface-colored tick at the expected pace, and "Acima do ritmo" (ink, gauge icon) when ahead of it.
- Summary hero (Instrument Serif): what is left of the budgeted total; footnotes for spending outside budgets and loan installments still due.
- Expanding a row: breakdown (à vista / parcelas de cartão / empréstimos / estornos), loan installments still due ("vai estourar"), card installments already committed for the next months, inline editor.
- Início shows an Orçamentos card (only when a budget exists) with up to 3 alerts. A one-time toast (ink, bottom) announces a category crossing 80% or 100% in this or next month.

## Optional Enhancement: Paper Grain on Hero Card
An SVG noise filter applied only to the Início hero gives the hero number a tactile, printed quality. Zero dependencies, works offline. Apply with 3–4% opacity — subtle, not visible as a texture.

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
| 2026-11-10 | 5-slot bottom nav with a Comparativo tab | Approved by the user — month-over-month comparison is a primary destination, not a buried link |
| 2026-11-10 | Charts in hand-built SVG, no chart library | ~50 KB gz saved for an offline PWA; typography and tokens stay exact |
| 2026-11-10 | Evolução shows saldo acumulado, not monthly saldo | User choice: shows whether money is building up over time |
| 2026-11-10 | Hatch pattern on Saídas / negative bars | Income/expense pair fails deuteranopia separation (ΔE 4.3); texture + fixed position make it color-independent |
| 2026-11-10 | Real dark mode via CSS variables | Previously only the page background changed; tokens now swap under prefers-color-scheme |
| 2026-11-10 | 14 more default categories + user-created categories | Defaults cover common Brazilian spending (Mercado, Assinaturas, Impostos…); v3 migration adds only missing ones by name. In-use categories can't be deleted, so history never loses its category |
| 2026-11-10 | Multi-account with transfers as a separate single-row entity | One row can't be half-applied, and transfers can never leak into income/expense reports. Balances are derived, never stored — nothing to drift |
| 2026-11-10 | Opening balance per account, dated, counted in patrimônio but not in receitas | User choice: accounts start at zero and the opening value appears from its date |
| 2026-11-10 | Bank logos bundled as static SVGs, linked by `bankId` | Logo APIs break offline and leak which banks the user has (Clearbit's free API was also shut down 2025-12-01). A stable id survives file renames; emoji stays as fallback. Brand color allowed only inside the logo tile — approved by the user |
| 2026-11-10 | Credit card = account `credit` linked to its bank; payment method on every transaction | Keeps balances/limit/patrimônio exact with no special cases, while the bank grouping and the method field answer "quanto foi no Pix × no cartão" |
| 2026-11-10 | Installments: Purchase + N stored rows; report month = invoice due month | One query path for every report; history stable if closing day changes; rounding computed once (1st installment absorbs remainder) |
| 2026-11-10 | Card insights in Comparativo: stacked card-vs-other, owed invoices, per-card invoice bars | Answers "how much of my spending goes on cards" and "what is still owed" without new hues; hidden when no card is in scope |
| 2026-11-10 | Loans: contract + append-only events with snapshots; schedule projected | Prepayments rewrite only the future; history is immutable; 360 rows compute in <1 ms; backups are verified by replaying the engine |
| 2026-11-10 | Own fixed-point decimal (BigInt, 30 places) instead of a library | User choice (no dependency); roots/powers for annual→monthly and daily pro-rata; money stays in integer centavos |
| 2026-11-10 | Subcategories (2 levels), refunds and monthly budgets; Comparativo tab becomes Análises | Approved by the user — budgets use the invoice month, refunds reduce spending, no traffic-light colors (vinho + hatch + words) |
| 2026-11-10 | Início answers "today": hero Disponível hoje + sobra prevista; Saldo Livre moves to "O mês" | Approved by the user — forward-looking number first; one consistent read model above the fold, lazy month section below; cached summary for instant paint |
