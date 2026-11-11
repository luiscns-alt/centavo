/**
 * Write path — Shared vocabulary and guards of the write path (see the feature ledgers).
 *
 * Every function validates *inside* the same read-write IndexedDB transaction that writes, so a
 * check can't go stale between reading and writing, and any error rolls the whole operation back.
 * Balances are never stored (see features/accounts/balances.ts).
 */
import { type Account, type AccountKind, type CardSettings, type CentavoDB, type PaymentMethod } from '../db'

/** Error with a pt-BR message meant to be shown to the user as-is */
export class LedgerError extends Error {}

export const ACCOUNT_KINDS: Record<AccountKind, { label: string; icon: string }> = {
  checking:   { label: 'Conta corrente', icon: '🏦' },
  savings:    { label: 'Poupança',       icon: '🐷' },
  wallet:     { label: 'Carteira',       icon: '👛' },
  investment: { label: 'Investimentos',  icon: '📈' },
  credit:     { label: 'Cartão de crédito', icon: '💳' },
  loan:       { label: 'Empréstimo', icon: '💸' },
}

/** Kinds the account form offers (cards have their own fields; loans are created as loans) */
export const EDITABLE_KINDS: AccountKind[] = ['checking', 'savings', 'wallet', 'investment', 'credit']

/** Accounts money can be paid from / received in: not cards, not loans */
export const isCashAccount = (a: Pick<Account, 'kind'>) => a.kind !== 'credit' && a.kind !== 'loan'

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  credit: 'Cartão de crédito',
  debit: 'Débito',
  boleto: 'Boleto',
  cash: 'Dinheiro',
  ted: 'TED',
}

/** Methods offered for non-card accounts, in picker order */
export const ACCOUNT_METHODS: PaymentMethod[] = ['pix', 'debit', 'boleto', 'ted', 'cash']

export const isMethod = (m: unknown): m is PaymentMethod => typeof m === 'string' && m in PAYMENT_METHODS
export const isDay = (d: unknown) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31
export const MAX_INSTALLMENTS = 48

export const NAME_MAX = 30
export const isKind = (k: unknown): k is AccountKind => typeof k === 'string' && k in ACCOUNT_KINDS

/** YYYY-MM-DD that is also a real calendar date */
export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export const isPositiveCentavos = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0

export function cleanDescription(d: string | undefined): string | undefined {
  const t = d?.trim()
  return t ? t.slice(0, 120) : undefined
}

// ─── Shared guards (read inside the caller's transaction) ─────────────────

/** An account that exists and is open — read inside the caller's transaction */
export async function openAccount(database: CentavoDB, id: unknown, label = 'Conta'): Promise<Account> {
  const acc = Number.isInteger(id) ? await database.accounts.get(id as number) : undefined
  if (!acc) throw new LedgerError(`${label} não encontrada.`)
  if (acc.archived) throw new LedgerError(`A conta "${acc.name}" está arquivada.`)
  return acc
}

export async function openCard(database: CentavoDB, id: unknown): Promise<Account & { card: CardSettings }> {
  const acc = await openAccount(database, id, 'Cartão')
  if (acc.kind !== 'credit' || !acc.card) throw new LedgerError('A conta escolhida não é um cartão de crédito.')
  return acc as Account & { card: CardSettings }
}

export async function cashAccount(database: CentavoDB, id: unknown, label: string): Promise<Account> {
  const acc = await openAccount(database, id, label)
  if (!isCashAccount(acc)) throw new LedgerError(`${label}: escolha uma conta bancária ou carteira.`)
  return acc
}

export async function expenseCategory(database: CentavoDB, id: unknown, label: string) {
  const cat = Number.isInteger(id) ? await database.categories.get(id as number) : undefined
  if (!cat || cat.type !== 'expense') throw new LedgerError(`${label}: escolha uma categoria de despesa.`)
}

export type RefundTarget = { kind: 'tx'; id: number } | { kind: 'purchase'; id: number }

/** Total already refunded for an expense or a card purchase */
export async function refundedOf(database: CentavoDB, target: RefundTarget): Promise<number> {
  const rows = target.kind === 'tx'
    ? await database.transactions.where('refundOf').equals(target.id).toArray()
    : await database.transactions.where('refundOfPurchase').equals(target.id).toArray()
  return rows.reduce((s, t) => s + t.amount, 0)
}

export const isMonthKey = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
