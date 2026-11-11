import 'fake-indexeddb/auto' // must load before Dexie
import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { CentavoDB, DEFAULT_CATEGORIES, MIGRATED_ACCOUNT_NAME, type Account, type Transaction } from '../../core/db'
import { BackupError, backupFilename, createBackup, parseBackup, restoreBackup, type Backup } from './backup'
import { createAccount } from '../accounts'
import { createCardPurchase, payInvoice } from '../credit-cards'
import { createLoan, payLoanInstallment, prepayLoan } from '../loans'

const opened: Dexie[] = []
let seq = 0

function freshDB(): CentavoDB {
  const db = new CentavoDB(`test-${++seq}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const sampleTx = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  type: 'expense', amount: 1250, categoryId: 6, accountId: 1, date: '2026-10-15', month: '2026-10', method: 'pix',
  createdAt: 1_760_000_000_000,
  ...overrides,
})

const sampleAccount = (name = 'Nubank'): Omit<Account, 'id'> => ({
  name, kind: 'checking', icon: '🏦', openingBalance: 10000, openingDate: '2026-01-01', archived: 0, createdAt: 1,
})

describe('backup round trip', () => {
  it('exports and restores every table unchanged', async () => {
    const source = freshDB()
    await source.accounts.bulkAdd([sampleAccount() as Account, sampleAccount('Carteira') as Account])
    await source.transfers.add({ fromAccountId: 1, toAccountId: 2, amount: 3000, date: '2026-10-16', createdAt: 2 })
    await source.transactions.bulkAdd([
      sampleTx({ description: 'Mercado' }) as Transaction,
      sampleTx({ type: 'income', amount: 500000, categoryId: 1 }) as Transaction,
    ])

    const backup = parseBackup(JSON.stringify(await createBackup(source)))
    const target = freshDB()
    await target.open() // seeds default categories, which restore must replace
    await target.categories.add({ name: 'Extra', type: 'expense', icon: '🧪' })
    await restoreBackup(backup, target)

    expect(await target.categories.toArray()).toEqual(await source.categories.toArray())
    expect(await target.transactions.toArray()).toEqual(await source.transactions.toArray())
    expect(await target.accounts.toArray()).toEqual(await source.accounts.toArray())
    expect(await target.transfers.toArray()).toEqual(await source.transfers.toArray())
  })

  it('leaves current data untouched when the restore fails midway', async () => {
    const db = freshDB()
    await db.accounts.add(sampleAccount() as Account)
    await db.transactions.add(sampleTx() as Transaction)
    const before = await db.transactions.toArray()

    const backup = await createBackup(db)
    // Duplicate primary key makes bulkAdd throw after the clears ran
    backup.transactions = [{ ...before[0] }, { ...before[0] }]

    await expect(restoreBackup(backup, db)).rejects.toThrow()
    expect(await db.transactions.toArray()).toEqual(before)
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length)
    expect(await db.accounts.count()).toBe(1)
  })
})

describe('credit cards in backups', () => {
  async function withCard() {
    const db = freshDB()
    const bank = await createAccount({ name: 'Banco', kind: 'checking', openingBalance: 0, openingDate: '2026-01-01' }, db)
    const card = await createAccount({ name: 'Cartão', kind: 'credit', openingBalance: 0, openingDate: '2026-01-01', card: { closingDay: 3, dueDay: 10, bankAccountId: bank } }, db)
    await createCardPurchase({ accountId: card, categoryId: 6, date: '2026-11-12', total: 100000, installments: 3 }, db)
    await payInvoice({ cardAccountId: card, invoiceMonth: '2026-12', fromAccountId: bank, amount: 33334, date: '2026-12-10' }, db)
    return db
  }

  it('round-trips cards, purchases, installments and invoice payments', async () => {
    const source = await withCard()
    const backup = parseBackup(JSON.stringify(await createBackup(source)))
    const target = freshDB()
    await restoreBackup(backup, target)
    expect(await target.purchases.toArray()).toEqual(await source.purchases.toArray())
    expect(await target.transactions.toArray()).toEqual(await source.transactions.toArray())
    expect(await target.transfers.toArray()).toEqual(await source.transfers.toArray())
    expect(await target.accounts.toArray()).toEqual(await source.accounts.toArray())
  })

  it('rejects installments that no longer add up to the purchase', async () => {
    const backup = await createBackup(await withCard())
    backup.transactions[1].amount += 1
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupError)
  })

  it('rejects a card whose bank account is missing', async () => {
    const backup = await createBackup(await withCard())
    backup.accounts[1].card!.bankAccountId = 99
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupError)
  })
})

describe('loans in backups', () => {
  async function withLoan() {
    const db = freshDB()
    const bank = await createAccount({ name: 'Banco', kind: 'checking', openingBalance: 0, openingDate: '2026-01-01' }, db)
    const { loanId } = await createLoan({
      name: 'Carro', type: 'vehicle', principal: 5_000_000, rate: { value: '1,5', unit: 'monthly' }, termMonths: 24,
      system: 'price', startDate: '2026-01-10', firstDueDate: '2026-02-10', release: 'deposit', releaseAccountId: bank,
      payFromAccountId: bank, principalCategoryId: 7, interestCategoryId: 6,
    }, db)
    await payLoanInstallment({ loanId, date: '2026-02-10' }, db)
    await prepayLoan({ loanId, date: '2026-02-25', amount: 500_000, mode: 'reduce-term' }, db)
    await payLoanInstallment({ loanId, date: '2026-03-10' }, db)
    return db
  }

  it('round-trips loans and their history', async () => {
    const source = await withLoan()
    const backup = parseBackup(JSON.stringify(await createBackup(source)))
    const target = freshDB()
    await restoreBackup(backup, target)
    expect(await target.loans.toArray()).toEqual(await source.loans.toArray())
    expect(await target.loanEvents.toArray()).toEqual(await source.loanEvents.toArray())
    expect(await target.transactions.toArray()).toEqual(await source.transactions.toArray())
  })

  it('rejects a tampered installment snapshot (replay must match the engine)', async () => {
    const backup = await createBackup(await withLoan())
    backup.loanEvents[1].interest += 1
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupError)
  })

  it('rejects a missing generated expense', async () => {
    const backup = await createBackup(await withLoan())
    backup.transactions = backup.transactions.filter(t => t.id !== backup.loanEvents[1].transactionIds[0])
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupError)
  })
})

describe('parseBackup', () => {
  const valid = (): Backup => ({
    app: 'centavo', version: 5, exportedAt: '2026-10-15T12:00:00.000Z',
    categories: [{ id: 1, name: 'Salário', type: 'income', icon: '💼' }],
    accounts: [
      { id: 1, name: 'Nubank', kind: 'checking', icon: '🏦', openingBalance: -500, openingDate: '2026-01-01', archived: 0, createdAt: 1 },
      { id: 2, name: 'Carteira', kind: 'wallet', icon: '👛', openingBalance: 0, openingDate: '2026-01-01', archived: 1, createdAt: 2 },
    ],
    transactions: [{ id: 1, type: 'income', amount: 100, categoryId: 1, accountId: 1, date: '2026-10-15', month: '2026-10', method: 'pix', createdAt: 1 }],
    transfers: [{ id: 1, fromAccountId: 1, toAccountId: 2, amount: 50, date: '2026-10-16', createdAt: 3 }],
    purchases: [],
    loans: [],
    loanEvents: [],
    budgets: [],
    budgetOverrides: [],
  })
  const withTx = (t: Record<string, unknown>) =>
    JSON.stringify({ ...valid(), transactions: [{ ...valid().transactions[0], ...t }] })
  const withTransfer = (t: Record<string, unknown>) =>
    JSON.stringify({ ...valid(), transfers: [{ ...valid().transfers[0], ...t }] })
  const withAccount = (a: Record<string, unknown>) =>
    JSON.stringify({ ...valid(), accounts: [{ ...valid().accounts[0], ...a }, valid().accounts[1]] })

  it('accepts a valid backup', () => {
    expect(parseBackup(JSON.stringify(valid()))).toEqual(valid())
  })

  it('upgrades a v1 backup: its transactions adopt one migrated account', () => {
    const v1 = {
      app: 'centavo', version: 1, exportedAt: '',
      categories: [{ id: 1, name: 'Salário', type: 'income', icon: '💼' }],
      transactions: [{ id: 1, type: 'income', amount: 100, categoryId: 1, date: '2026-10-15', createdAt: 1 }],
    }
    const parsed = parseBackup(JSON.stringify(v1))
    expect(parsed.version).toBe(5)
    expect(parsed.transactions[0]).toMatchObject({ month: '2026-10', method: 'pix' })
    expect(parsed.accounts).toHaveLength(1)
    expect(parsed.accounts[0].name).toBe(MIGRATED_ACCOUNT_NAME)
    expect(parsed.transactions[0].accountId).toBe(parsed.accounts[0].id)
    expect(parsed.transfers).toEqual([])
  })

  it.each([
    ['not JSON', 'oops'],
    ['another app', JSON.stringify({ ...valid(), app: 'other' })],
    ['a newer format', JSON.stringify({ ...valid(), version: 6 })],
    ['missing budgets', JSON.stringify({ ...valid(), budgets: undefined })],
    ['missing loans', JSON.stringify({ ...valid(), loans: undefined })],
    ['missing purchases', JSON.stringify({ ...valid(), purchases: undefined })],
    ['bad report month', withTx({ month: '2026-13' })],
    ['unknown payment method', withTx({ method: 'cheque' })],
    ['missing transactions', JSON.stringify({ ...valid(), transactions: undefined })],
    ['missing accounts', JSON.stringify({ ...valid(), accounts: undefined })],
    ['missing transfers', JSON.stringify({ ...valid(), transfers: undefined })],
    ['float amount', withTx({ amount: 12.5 })],
    ['zero amount', withTx({ amount: 0 })],
    ['bad date', withTx({ date: '15/10/2026' })],
    ['bad type', withTx({ type: 'transfer' })],
    ['unknown category', withTx({ categoryId: 99 })],
    ['transaction without account', withTx({ accountId: undefined })],
    ['unknown account', withTx({ accountId: 99 })],
    ['transfer to the same account', withTransfer({ toAccountId: 1 })],
    ['transfer to an unknown account', withTransfer({ toAccountId: 99 })],
    ['negative transfer', withTransfer({ amount: -50 })],
    ['impossible transfer date', withTransfer({ date: '2026-02-30' })],
    ['float opening balance', withAccount({ openingBalance: 1.5 })],
    ['unknown account kind', withAccount({ kind: 'crypto' })],
  ])('rejects %s', (_label, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError)
  })

  it('keeps known bank ids and drops unknown ones', () => {
    const known = parseBackup(withAccount({ bankId: 'nubank' }))
    expect(known.accounts[0].bankId).toBe('nubank')
    const unknown = parseBackup(withAccount({ bankId: 'banco-do-futuro' }))
    expect(unknown.accounts[0]).not.toHaveProperty('bankId')
  })

  it('drops unknown fields', () => {
    const parsed = parseBackup(withTx({ evil: '<script>' }))
    expect(parsed.transactions[0]).not.toHaveProperty('evil')
  })
})

describe('backupFilename', () => {
  it('includes the date', () => {
    expect(backupFilename('2026-10-15')).toBe('centavo-backup-2026-10-15.json')
  })
})

describe('v1 → v2 migration', () => {
  it('converts v1 transactions instead of deleting them', async () => {
    const name = `test-${++seq}`
    const v1 = new Dexie(name)
    v1.version(1).stores({
      accounts: '++id, type, currency, createdAt',
      categories: '++id, type',
      transactions: '++id, accountId, categoryId, type, date, createdAt',
    })
    await v1.table('accounts').add({ name: 'Conta', type: 'checking', balance: 0, currency: 'BRL', createdAt: new Date() })
    await v1.table('transactions').bulkAdd([
      { accountId: 1, categoryId: 1, amount: 4500.5, type: 'income', description: 'Salário', date: new Date(2026, 9, 5, 23, 30), createdAt: new Date(1_760_000_000_000) },
      { accountId: 1, categoryId: 6, amount: 12.345, type: 'expense', description: '', date: new Date(2026, 9, 6), createdAt: new Date(1_760_000_000_001) },
      { accountId: 1, categoryId: 6, amount: 100, type: 'transfer', description: 'Poupança', date: new Date(2026, 9, 7), createdAt: new Date() },
    ])
    v1.close()

    const db = new CentavoDB(name)
    opened.push(db)
    const rows = await db.transactions.orderBy('id').toArray()

    expect(rows).toEqual([
      { id: 1, categoryId: 1, accountId: 1, amount: 450050, type: 'income', description: 'Salário', date: '2026-10-05', month: '2026-10', method: 'pix', createdAt: 1_760_000_000_000 },
      { id: 2, categoryId: 6, accountId: 1, amount: 1235, type: 'expense', date: '2026-10-06', month: '2026-10', method: 'pix', createdAt: 1_760_000_000_001 },
    ])
    // v2 dropped the v1 accounts; v4 recreates the table with one account adopting all transactions
    const accounts = await db.accounts.toArray()
    expect(accounts.map(a => [a.id, a.name])).toEqual([[1, MIGRATED_ACCOUNT_NAME]])
  })
})
