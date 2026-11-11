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
  core/       db (schema, types), decimal, storage, ledger/base (LedgerError, shared guards)
  shared/     generic UI (ui/) and charts (charts/) — no business knowledge
  features/<name>/   accounts · transactions · credit-cards · loans · categories · budgets ·
                     analytics · home · settings — screens, hooks, pure logic, ledger.ts, tests
```
- Another feature is imported only through its `index.ts` (`features/<name>`); add to the index what you expose.
- `core/` and `shared/` never import `app/` or `features/` (core may `import type`). Features never import `app/`.
- Screens (`*.tsx`) and hooks (`use*.ts`) only read the database; writes go through ledger functions.
- Rules live in `eslint-rules/architecture.js` (`architecture/boundaries`, `architecture/no-ui-writes`).
