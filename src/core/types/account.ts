/** Persisted domain entities (accounts and cards) — the shapes stored in IndexedDB (see core/db.ts). */

export type AccountKind = 'checking' | 'savings' | 'wallet' | 'investment' | 'credit' | 'loan'

/** Credit-card settings — present only on accounts of kind 'credit' */
export interface CardSettings {
  closingDay: number      // 1–31, clamped to the month's last day
  dueDay: number          // 1–31, clamped to the month's last day
  limit?: number          // integer centavos
  /** The issuing bank's account: groups the card under it and is the default payer of invoices */
  bankAccountId: number
}

export interface Account {
  id?: number
  name: string
  kind: AccountKind
  /** Emoji — always kept, shown when there is no bank logo (or it fails to load) */
  icon: string
  /** Known bank from src/banks/catalog.ts ("nubank"…); absent = no logo. Not indexed, so no schema bump */
  bankId?: string
  /** Saldo inicial, integer centavos — may be negative (overdrawn checking) */
  openingBalance: number
  /** YYYY-MM-DD from which the opening balance counts — before it the account holds R$ 0 */
  openingDate: string
  archived: 0 | 1       // 0/1 instead of boolean so it can be indexed
  createdAt: number
  card?: CardSettings
}
