/**
 * Write path — Accounts: create, edit, archive, delete.
 *
 * Every function validates *inside* the same read-write IndexedDB transaction that writes, so a
 * check can't go stale between reading and writing, and any error rolls the whole operation back.
 * Balances are never stored (see features/accounts/balances.ts).
 */
import { db as defaultDb, type CentavoDB } from '../../core/db'
import { LedgerError, NAME_MAX, isCashAccount, isDay, isKind } from '../../core/ledger/base'
import { bankById } from './banks/catalog'
import { ACCOUNT_KINDS } from '../../core/constants/domain'
import type { Account, AccountKind, CardSettings } from '../../core/types'
import { isISODate } from '../../shared/utils/dates'
import { firstGrapheme } from '../../shared/utils/text'

export interface AccountInput {
  name: string
  kind: AccountKind
  icon?: string
  /** Known bank id, or null/undefined for none */
  bankId?: string | null
  openingBalance: number
  openingDate: string
  /** Required when kind is 'credit', ignored otherwise */
  card?: CardSettings
}

export async function validAccount(database: CentavoDB, input: AccountInput, ignoreId?: number, allowLoan = false) {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) throw new LedgerError('Dê um nome para a conta.')
  if (name.length > NAME_MAX) throw new LedgerError(`Use até ${NAME_MAX} caracteres no nome.`)
  if (!isKind(input.kind)) throw new LedgerError('Tipo de conta inválido.')
  if (input.kind === 'loan' && !allowLoan) throw new LedgerError('Empréstimos são cadastrados como empréstimo.')
  if (!Number.isSafeInteger(input.openingBalance)) throw new LedgerError('Saldo inicial inválido.')
  if (!isISODate(input.openingDate)) throw new LedgerError('Data do saldo inicial inválida.')
  const key = name.toLocaleLowerCase('pt-BR')
  const clash = await database.accounts
    .filter(a => a.id !== ignoreId && a.name.toLocaleLowerCase('pt-BR') === key)
    .first()
  if (clash) throw new LedgerError(`Já existe uma conta "${clash.name}".`)
  if (input.bankId && !bankById(input.bankId)) throw new LedgerError('Banco desconhecido.')

  let card: CardSettings | undefined
  if (input.kind === 'credit') {
    const c = input.card
    if (!c || !isDay(c.closingDay) || !isDay(c.dueDay)) throw new LedgerError('Informe os dias de fechamento e vencimento (1 a 31).')
    if (c.limit !== undefined && (!Number.isSafeInteger(c.limit) || c.limit < 0)) throw new LedgerError('Limite inválido.')
    const bank = Number.isInteger(c.bankAccountId) ? await database.accounts.get(c.bankAccountId) : undefined
    if (!bank || bank.id === ignoreId) throw new LedgerError('Escolha a conta do banco do cartão.')
    if (!isCashAccount(bank)) throw new LedgerError('Um cartão precisa ser vinculado a uma conta bancária.')
    card = { closingDay: c.closingDay, dueDay: c.dueDay, bankAccountId: c.bankAccountId }
    if (c.limit !== undefined) card.limit = c.limit
  }

  return {
    card,
    name,
    kind: input.kind,
    icon: firstGrapheme(input.icon ?? '') || ACCOUNT_KINDS[input.kind].icon,
    // undefined (not null) so "no bank" leaves no field behind
    bankId: input.bankId || undefined,
    openingBalance: input.openingBalance,
    openingDate: input.openingDate,
  }
}

export async function createAccount(input: AccountInput, database: CentavoDB = defaultDb): Promise<number> {
  return database.transaction('rw', database.accounts, async () => {
    const clean = await validAccount(database, input)
    const account: Omit<Account, 'id'> = { ...clean, archived: 0, createdAt: Date.now() }
    if (!account.bankId) delete account.bankId
    if (!account.card) delete account.card
    return database.accounts.add(account as Account) as Promise<number>
  })
}

export async function updateAccount(id: number, input: AccountInput, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', [database.accounts, database.transactions, database.transfers, database.purchases, database.loans], async () => {
    const current = await database.accounts.get(id)
    if (!current) throw new LedgerError('Conta não encontrada.')
    if ((current.kind === 'loan') !== (input.kind === 'loan')) throw new LedgerError('O tipo de um empréstimo não pode ser trocado.')
    const clean = await validAccount(database, input, id, current.kind === 'loan')
    // A card's movements (installments, invoice payments) only make sense on a card, and vice versa
    if ((current.kind === 'credit') !== (clean.kind === 'credit') && (await accountUsage(id, database)) > 0) {
      throw new LedgerError('Não dá para transformar uma conta com movimentações em cartão (nem o contrário).')
    }
    if (current.kind !== 'credit' && clean.kind === 'credit' && (await cardsOf(id, database)).length > 0) {
      throw new LedgerError('Esta conta tem cartões vinculados — ela não pode virar um cartão.')
    }
    // put, so clearing the bank/card really removes the field
    const next: Account = { ...current, ...clean }
    if (!clean.bankId) delete next.bankId
    if (!clean.card) delete next.card
    await database.accounts.put(next)
  })
}

/** Archived accounts keep their history and balance but leave pickers and lists */
export async function setAccountArchived(id: number, archived: boolean, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.accounts, async () => {
    if (!(await database.accounts.get(id))) throw new LedgerError('Conta não encontrada.')
    await database.accounts.update(id, { archived: archived ? 1 : 0 })
  })
}

/** How many transactions, purchases and transfers reference an account */
export async function accountUsage(id: number, database: CentavoDB = defaultDb): Promise<number> {
  const [txs, out, inn, buys, loans] = await Promise.all([
    database.transactions.where('accountId').equals(id).count(),
    database.transfers.where('fromAccountId').equals(id).count(),
    database.transfers.where('toAccountId').equals(id).count(),
    database.purchases.where('accountId').equals(id).count(),
    database.loans.filter(l => l.accountId === id || l.payFromAccountId === id || l.releaseAccountId === id).count(),
  ])
  return txs + out + inn + buys + loans
}

/** Cards issued under a bank account */
export async function cardsOf(bankAccountId: number, database: CentavoDB = defaultDb): Promise<Account[]> {
  return database.accounts.filter(a => a.kind === 'credit' && a.card?.bankAccountId === bankAccountId).toArray()
}

/** Hard delete only for accounts nothing points to — otherwise archive, never orphan history */
export async function deleteAccount(id: number, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', [database.accounts, database.transactions, database.transfers, database.purchases, database.loans], async () => {
    if ((await database.accounts.get(id))?.kind === 'loan') throw new LedgerError('Exclua pelo empréstimo.')
    if ((await accountUsage(id, database)) > 0) {
      throw new LedgerError('A conta tem movimentações — arquive em vez de excluir.')
    }
    if ((await cardsOf(id, database)).length > 0) {
      throw new LedgerError('A conta tem cartões vinculados — exclua ou desvincule os cartões antes.')
    }
    await database.accounts.delete(id)
  })
}
