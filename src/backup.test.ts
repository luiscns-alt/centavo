import 'fake-indexeddb/auto' // must load before Dexie
import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { CentavoDB, type Transaction } from './db'
import { BackupError, backupFilename, createBackup, parseBackup, restoreBackup, type Backup } from './backup'

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
  type: 'expense', amount: 1250, categoryId: 6, date: '2026-10-15', createdAt: 1_760_000_000_000,
  ...overrides,
})

describe('backup round trip', () => {
  it('exports and restores categories and transactions unchanged', async () => {
    const source = freshDB()
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
  })

  it('leaves current data untouched when the restore fails midway', async () => {
    const db = freshDB()
    await db.transactions.add(sampleTx() as Transaction)
    const before = await db.transactions.toArray()

    const backup = await createBackup(db)
    // Duplicate primary key makes bulkAdd throw after the clears ran
    backup.transactions = [{ ...before[0] }, { ...before[0] }]

    await expect(restoreBackup(backup, db)).rejects.toThrow()
    expect(await db.transactions.toArray()).toEqual(before)
    expect(await db.categories.count()).toBe(14)
  })
})

describe('parseBackup', () => {
  const valid = (): Backup => ({
    app: 'centavo', version: 1, exportedAt: '2026-10-15T12:00:00.000Z',
    categories: [{ id: 1, name: 'Salário', type: 'income', icon: '💼' }],
    transactions: [{ id: 1, type: 'income', amount: 100, categoryId: 1, date: '2026-10-15', createdAt: 1 }],
  })
  const withTx = (t: Record<string, unknown>) =>
    JSON.stringify({ ...valid(), transactions: [{ ...valid().transactions[0], ...t }] })

  it('accepts a valid backup', () => {
    expect(parseBackup(JSON.stringify(valid()))).toEqual(valid())
  })

  it.each([
    ['not JSON', 'oops'],
    ['another app', JSON.stringify({ ...valid(), app: 'other' })],
    ['a newer format', JSON.stringify({ ...valid(), version: 2 })],
    ['missing transactions', JSON.stringify({ ...valid(), transactions: undefined })],
    ['float amount', withTx({ amount: 12.5 })],
    ['zero amount', withTx({ amount: 0 })],
    ['bad date', withTx({ date: '15/10/2026' })],
    ['bad type', withTx({ type: 'transfer' })],
    ['unknown category', withTx({ categoryId: 99 })],
  ])('rejects %s', (_label, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError)
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
      { id: 1, categoryId: 1, amount: 450050, type: 'income', description: 'Salário', date: '2026-10-05', createdAt: 1_760_000_000_000 },
      { id: 2, categoryId: 6, amount: 1235, type: 'expense', date: '2026-10-06', createdAt: 1_760_000_000_001 },
    ])
    expect(db.tables.map(t => t.name)).not.toContain('accounts')
  })
})
