# Centavo

Personal cash flow tracker PWA. Privacy-first, offline, no backend.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that does not match DESIGN.md.

Key rules from DESIGN.md:
- Hero balance number: Instrument Serif, 44px, income/expense/muted color based on sign
- All other text: Plus Jakarta Sans
- Amounts in lists: Plus Jakarta Sans with `font-variant-numeric: tabular-nums lining-nums`
- Income color: #2D6A4F (emerald). Expense color: #9B2335 (burgundy). Never use these for non-financial UI.
- Background: #F7F5F1 (warm off-white). Never pure white as page background.
- Buttons are dark (#1A1816) for generic actions. Only use income/expense colors for save buttons when the form type is set.
- Charts: hand-built SVG in `src/shared/charts/`. Saídas/negative bars always hatched (colorblind safety) — see DESIGN.md → Charts.
- Money writes go through the ledger modules only — `features/<name>/ledger.ts` on top of `core/ledger/base.ts` (validation inside the IndexedDB transaction). Balances are derived in `features/accounts/balances.ts` — never store a balance field.
- Transfers are not income/expense: never add them to Saldo Livre, categories or Entradas/Saídas.
- Card purchases only via `createCardPurchase` (never `transactions.add` on a credit account). Reports group by `transaction.month`; balances use `transaction.date`.
- Loans: money moves only through `createLoan` / `payLoanInstallment` / `prepayLoan` / `adjustLoanBalance` / `undoLastLoanEvent`. Rate math lives in `features/loans/loanMath.ts` on `core/decimal.ts` — never use JS floats for rates.
- Refunds (`type: 'refund'`) only via `createRefund`; they lower spending (`expenseDelta`) and are never income. Use `signedAmount` for balances.
- Budgets: limits via `saveBudget` / `setBudget` / `setBudgetOverride`; math is pure in `features/budgets/budgets.ts` (spent by `transaction.month`, parent = own + children). Categories are a 2-level tree (`parentId`).
- Início: the top of the screen reads only `loadHomeSummary` (`features/home/home.ts`, one read transaction, pure `buildHomeSummary`). Add new home widgets to that summary instead of new queries; below-the-fold widgets go in `MonthSection` (lazy).
- Android test APK: Capacitor 8 (`capacitor.config.ts`), bundled `dist/` only (offline, no server URL, no cleartext). `npm run apk:debug`; debug tweaks applied by `scripts/android-debug-setup.mjs` (applicationId .debug, shared key `keystores/debug.keystore`).

## Architecture (feature-based, lint-enforced)
```
src/
  app/        shell: App, nav, SideNav/BottomNav — composes features
  core/       db (Dexie schema + migrations), types/ (persisted entities), constants/domain
              (labels, option lists), amounts (signedAmount/expenseDelta), decimal, storage,
              ledger/base (LedgerError, shared guards)
  shared/     no business knowledge: ui/, charts/, utils/ (dates, money, storage, text),
              constants/storageKeys
  features/<name>/   accounts · transactions · credit-cards · loans · categories · budgets ·
                     analytics · home · settings — screens, hooks, pure logic, ledger.ts, tests
```
- Another feature is imported only through its `index.ts` (`features/<name>`); add to the index what you expose.
- `core/` and `shared/` never import `app/` or `features/` (core may `import type`). Features never import `app/`.
- Screens (`*.tsx`) and hooks (`use*.ts`) only read the database; writes go through ledger functions.
- Types: persisted entities in `core/types/`; a feature's own types stay in the feature (exported via its index); component `Props` stay next to the component.
- No `enum` (`erasableSyntaxOnly`): use `as const` objects + derived unions. Typed literal comparisons (`t.type === 'expense'`) are fine; constants are for lists and labels.
- Dates and money: never re-implement month names or BRL formatting — use `shared/utils/dates` and `shared/utils/money`. localStorage only through `shared/utils/storage` with keys from `STORAGE_KEYS`.
- Styling — **migration to Panda CSS in progress** (branch `feat/panda-css`, config in `panda.config.ts`):
  - Migrated files use only Panda (`css`, `cva`, `cx` from `styled-system/css`; tokens only, `strictTokens`). Never add Tailwind classes to them; a parent may pass `className` for layout only (margins, flex), never colors.
  - Not-yet-migrated files keep Tailwind v4 (`@tailwindcss/vite`), colors only from the `@theme` tokens (lint `architecture/tailwind-colors`).
  - Panda tokens point at the CSS variables of `src/index.css` until Tailwind is removed; Tailwind's preflight is the only reset meanwhile.
  - Migrated so far: `shared/ui/variants.ts` (button, chip), `Button`, `MoneyInput`/`FieldLabel`/`Choice`, `BudgetBar`, `TransactionRow`.
  - `styled-system/` is generated (`npm install` runs `panda codegen`) and gitignored.
- Rules live in `eslint-rules/architecture.js` (`architecture/boundaries`, `architecture/no-ui-writes`, `architecture/tailwind-colors`).
