import { signedAmount } from '../../core/amounts'
import type { Account, Loan, LoanEvent, Transaction, Transfer } from '../../core/types'

type Tx = Pick<Transaction, 'type' | 'amount' | 'accountId' | 'date'>
type Tr = Pick<Transfer, 'fromAccountId' | 'toAccountId' | 'amount' | 'date'>
type Acc = Pick<Account, 'id' | 'openingBalance' | 'openingDate'>

/**
 * Derived balance of every account at the end of `asOf` (YYYY-MM-DD, inclusive; omit for
 * all-time). Balances are always computed from the ledger, never stored.
 *
 *   saldo = saldo inicial + receitas − despesas + transferências recebidas − enviadas
 */
export function accountBalances(
  accounts: Acc[], transactions: Tx[], transfers: Tr[], asOf?: string, credits: AccountCredit[] = [],
): Map<number, number> {
  const inRange = (d: string) => asOf === undefined || d <= asOf
  const bal = new Map<number, number>()
  for (const a of accounts) {
    if (a.id == null) continue
    bal.set(a.id, inRange(a.openingDate) ? a.openingBalance : 0)
  }
  const add = (id: number, v: number) => bal.set(id, (bal.get(id) ?? 0) + v)
  for (const t of transactions) {
    if (inRange(t.date)) add(t.accountId, signedAmount(t))
  }
  for (const t of transfers) {
    if (!inRange(t.date)) continue
    add(t.fromAccountId, -t.amount)
    add(t.toAccountId, t.amount)
  }
  for (const c of credits) if (inRange(c.date)) add(c.accountId, c.amount)
  return bal
}

/**
 * A non-cash change to an account's balance. Loans use it: paying an installment is an expense
 * on the bank account, and the principal part lowers the debt on the loan account.
 */
export interface AccountCredit { accountId: number; date: string; amount: number }

/** Debt reductions recorded by loan events (principal amortized; adjust = old − new balance) */
export function loanCredits(loans: Pick<Loan, 'id' | 'accountId'>[], events: Pick<LoanEvent, 'loanId' | 'kind' | 'date' | 'principal'>[]): AccountCredit[] {
  const accountOf = new Map(loans.map(l => [l.id as number, l.accountId]))
  const out: AccountCredit[] = []
  for (const e of events) {
    if (e.kind === 'release' || e.principal === 0) continue
    const accountId = accountOf.get(e.loanId)
    if (accountId !== undefined) out.push({ accountId, date: e.date, amount: e.principal })
  }
  return out
}

export const sumBalances = (bal: Map<number, number>) => [...bal.values()].reduce((s, v) => s + v, 0)

/** Dated changes to a balance that are neither income nor expense (opening balances, transfers) */
export interface BalanceAdjustment {
  date: string
  amount: number // signed centavos
}

/**
 * Adjustments for the running balance ("patrimônio") of a set of accounts (null = all).
 * Transfers inside the set cancel out (e.g. paying a card from its own bank), so only
 * opening balances and transfers crossing the set's boundary count.
 */
export function balanceAdjustments(
  accounts: Acc[], transfers: Tr[], accountIds: number[] | null, credits: AccountCredit[] = [],
): BalanceAdjustment[] {
  const inSet = (id: number | undefined) => accountIds === null || (id !== undefined && accountIds.includes(id))
  const out: BalanceAdjustment[] = []
  for (const a of accounts) {
    if (a.openingBalance !== 0 && inSet(a.id)) out.push({ date: a.openingDate, amount: a.openingBalance })
  }
  for (const c of credits) if (inSet(c.accountId)) out.push({ date: c.date, amount: c.amount })
  if (accountIds !== null) {
    for (const t of transfers) {
      const fromIn = inSet(t.fromAccountId)
      const toIn = inSet(t.toAccountId)
      if (toIn && !fromIn) out.push({ date: t.date, amount: t.amount })
      if (fromIn && !toIn) out.push({ date: t.date, amount: -t.amount })
    }
  }
  return out
}
