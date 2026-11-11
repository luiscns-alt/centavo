import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../../core/db'
import { accountBalances, loanCredits } from './balances'

export type AccountWithBalance = Account & { id: number; balance: number }

/** Open accounts first, then archived; oldest first within each */
const byStatus = (a: Account, b: Account) => a.archived - b.archived || a.createdAt - b.createdAt

/** All accounts (archived included), live */
export function useAccounts(): Account[] | undefined {
  return useLiveQuery(async () => (await db.accounts.toArray()).sort(byStatus))
}

/**
 * Every account with its derived balance at the end of `asOf` (YYYY-MM-DD; omit for all-time),
 * plus the total across accounts — the patrimônio.
 */
export function useAccountBalances(
  asOf?: string,
  /** Balances already computed elsewhere (Início summary): only the accounts are read */
  known?: Record<number, number>,
): { accounts: AccountWithBalance[]; total: number; loading: boolean } {
  const result = useLiveQuery(async () => {
    if (known) {
      const list = (await db.accounts.toArray())
        .filter((a): a is Account & { id: number } => a.id != null)
        .sort(byStatus)
        .map(a => ({ ...a, balance: known[a.id] ?? 0 }))
      return { accounts: list, total: list.reduce((s, a) => s + a.balance, 0) }
    }
    const [accounts, transactions, transfers, loans, loanEvents] = await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.transfers.toArray(),
      db.loans.toArray(),
      db.loanEvents.toArray(),
    ])
    const bal = accountBalances(accounts, transactions, transfers, asOf, loanCredits(loans, loanEvents))
    const list = accounts
      .filter((a): a is Account & { id: number } => a.id != null)
      .sort(byStatus)
      .map(a => ({ ...a, balance: bal.get(a.id) ?? 0 }))
    return { accounts: list, total: list.reduce((s, a) => s + a.balance, 0) }
  }, [asOf, known])

  if (!result) return { accounts: [], total: 0, loading: true }
  return { ...result, loading: false }
}
