import type { Account } from '../../core/db'

/**
 * What the account filter points at, stored as a short string:
 *   ''      all accounts
 *   'a:7'   one account (or one card)
 *   'b:2'   a bank: its account plus every card issued under it
 */
export type AccountSelection = string

export function resolveSelection(sel: AccountSelection, accounts: Account[]): number[] | null {
  const m = /^([ab]):(\d+)$/.exec(sel)
  if (!m) return null
  const id = Number(m[2])
  if (!accounts.some(a => a.id === id)) return null // stale: falls back to all
  if (m[1] === 'a') return [id]
  return [id, ...accounts.filter(a => a.card?.bankAccountId === id).map(a => a.id as number)]
}

/** Cards grouped under their bank account; banks without cards have an empty list */
export function groupByBank<T extends Account>(accounts: T[]): { bank: T; cards: T[] }[] {
  // Loans are listed apart (see AccountsCard); here: bank accounts with their cards
  accounts = accounts.filter(a => a.kind !== 'loan')
  const banks = accounts.filter(a => a.kind !== 'credit')
  const orphanCards = accounts.filter(a => a.kind === 'credit' && !banks.some(b => b.id === a.card?.bankAccountId))
  const groups = banks.map(bank => ({ bank, cards: accounts.filter(a => a.kind === 'credit' && a.card?.bankAccountId === bank.id) }))
  // A card whose bank is gone still shows up, as its own group
  return [...groups, ...orphanCards.map(c => ({ bank: c, cards: [] as T[] }))]
}
