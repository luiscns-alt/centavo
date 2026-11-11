import 'fake-indexeddb/auto' // must load before Dexie
import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { CentavoDB, MIGRATED_ACCOUNT_NAME } from '../../core/db'
import { LedgerError } from '../../core/ledger/base'
import { accountUsage, createAccount, deleteAccount, setAccountArchived, updateAccount, accountBalances, balanceAdjustments, sumBalances } from '../accounts'
import { createCardPurchase, deleteCardPurchase, payInvoice, updateCardPurchase } from '../credit-cards'
import { addTransaction, createTransfer, deleteTransaction, deleteTransfer, updateTransaction, updateTransfer } from './ledger'
import { buildMonthlySeries } from '../analytics'
import type { Account, Transaction, Transfer } from '../../core/types'
import { isISODate } from '../../shared/utils/dates'

const opened: Dexie[] = []
let seq = 0

function freshDB(name = `ledger-test-${++seq}`): CentavoDB {
  const db = new CentavoDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await Dexie.delete(db.name)
  }
})

const acc = (name: string, opening = 0, openingDate = '2026-01-01') =>
  ({ name, kind: 'checking' as const, openingBalance: opening, openingDate })

// Default categories: 1 = Salário (income), 6 = Alimentação (expense)
const SALARIO = 1
const ALIMENTACAO = 6

describe('v3 → v4 migration', () => {
  async function v3With(transactions: object[]) {
    const name = `ledger-upgrade-${++seq}`
    const v3 = new Dexie(name)
    v3.version(3).stores({ categories: '++id, type', transactions: '++id, categoryId, type, date, createdAt' })
    await v3.open()
    await v3.table('categories').bulkAdd([{ name: 'Salário', type: 'income', icon: '💼' }])
    if (transactions.length) await v3.table('transactions').bulkAdd(transactions)
    v3.close()
    return freshDB(name)
  }

  it('moves every existing transaction into one migrated account', async () => {
    const db = await v3With([
      { type: 'income', amount: 100, categoryId: 1, date: '2026-10-01', createdAt: 1 },
      { type: 'expense', amount: 40, categoryId: 1, date: '2026-10-02', createdAt: 2 },
    ])
    const accounts = await db.accounts.toArray()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ name: MIGRATED_ACCOUNT_NAME, openingBalance: 0, archived: 0 })
    const txs = await db.transactions.toArray()
    expect(txs.map(t => t.accountId)).toEqual([accounts[0].id, accounts[0].id])
    expect(txs.map(t => t.amount)).toEqual([100, 40])
  })

  it('creates no account when there is nothing to adopt', async () => {
    const db = await v3With([])
    expect(await db.accounts.count()).toBe(0)
  })
})

describe('accounts', () => {
  it('creates with trimmed name, kind icon and opening balance', async () => {
    const db = freshDB()
    const id = await createAccount({ ...acc('  Nubank  ', -2500), kind: 'checking' }, db)
    expect(await db.accounts.get(id)).toMatchObject({ name: 'Nubank', icon: '🏦', openingBalance: -2500, archived: 0 })
  })

  it('rejects duplicates, empty names, fractional balances and impossible dates', async () => {
    const db = freshDB()
    await createAccount(acc('Nubank'), db)
    await expect(createAccount(acc('NUBANK'), db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createAccount(acc('  '), db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createAccount(acc('Inter', 10.5), db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createAccount(acc('Inter', 0, '2026-02-30'), db)).rejects.toBeInstanceOf(LedgerError)
    expect(await db.accounts.count()).toBe(1)
  })

  it('links a known bank and clears it again', async () => {
    const db = freshDB()
    const id = await createAccount({ ...acc('Meu Nubank'), bankId: 'nubank' }, db)
    expect((await db.accounts.get(id))?.bankId).toBe('nubank')
    await updateAccount(id, { ...acc('Meu Nubank'), bankId: null }, db)
    expect(await db.accounts.get(id)).not.toHaveProperty('bankId')
    await expect(createAccount({ ...acc('X'), bankId: 'banco-inventado' }, db)).rejects.toBeInstanceOf(LedgerError)
    const plain = await createAccount(acc('Cofre'), db)
    expect(await db.accounts.get(plain)).not.toHaveProperty('bankId')
  })

  it('updates, keeping its own name allowed', async () => {
    const db = freshDB()
    const id = await createAccount(acc('Nubank'), db)
    await updateAccount(id, { ...acc('nubank', 900), kind: 'savings' }, db)
    expect(await db.accounts.get(id)).toMatchObject({ name: 'nubank', kind: 'savings', openingBalance: 900 })
  })

  it('deletes only unused accounts; used ones must be archived', async () => {
    const db = freshDB()
    const used = await createAccount(acc('Usada'), db)
    const other = await createAccount(acc('Outra'), db)
    const free = await createAccount(acc('Livre'), db)
    await createTransfer({ fromAccountId: other, toAccountId: used, amount: 1, date: '2026-11-01' }, db)
    await expect(deleteAccount(used, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(deleteAccount(other, db)).rejects.toBeInstanceOf(LedgerError)
    await deleteAccount(free, db)
    expect(await db.accounts.get(free)).toBeUndefined()
    expect(await accountUsage(used, db)).toBe(1)
  })

  it('archived accounts refuse new movements', async () => {
    const db = freshDB()
    const a = await createAccount(acc('A'), db)
    const b = await createAccount(acc('B'), db)
    await setAccountArchived(a, true, db)
    await expect(addTransaction({ type: 'income', amount: 1, categoryId: SALARIO, accountId: a, date: '2026-11-01' }, db))
      .rejects.toBeInstanceOf(LedgerError)
    await expect(createTransfer({ fromAccountId: b, toAccountId: a, amount: 1, date: '2026-11-01' }, db))
      .rejects.toBeInstanceOf(LedgerError)
    await setAccountArchived(a, false, db)
    await expect(createTransfer({ fromAccountId: b, toAccountId: a, amount: 1, date: '2026-11-01' }, db))
      .resolves.toBeTypeOf('number')
  })
})

describe('addTransaction', () => {
  it('writes a valid income/expense', async () => {
    const db = freshDB()
    const a = await createAccount(acc('A'), db)
    const id = await addTransaction({ type: 'expense', amount: 1250, categoryId: ALIMENTACAO, accountId: a, date: '2026-11-10', description: '  Feira  ' }, db)
    expect(await db.transactions.get(id)).toMatchObject({ amount: 1250, accountId: a, description: 'Feira' })
  })

  it.each([
    ['zero amount', { amount: 0 }],
    ['fractional centavos', { amount: 12.5 }],
    ['unknown account', { accountId: 999 }],
    ['category of the other type', { categoryId: SALARIO }],
    ['impossible date', { date: '2026-13-01' }],
  ])('rejects %s', async (_label, patch) => {
    const db = freshDB()
    const a = await createAccount(acc('A'), db)
    await expect(addTransaction({ type: 'expense', amount: 100, categoryId: ALIMENTACAO, accountId: a, date: '2026-11-10', ...patch }, db))
      .rejects.toBeInstanceOf(LedgerError)
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('transfers', () => {
  it('is a single row that moves money from A to B', async () => {
    const db = freshDB()
    const a = await createAccount(acc('A', 10000), db)
    const b = await createAccount(acc('B'), db)
    await createTransfer({ fromAccountId: a, toAccountId: b, amount: 2500, date: '2026-11-10' }, db)
    expect(await db.transfers.count()).toBe(1)
    expect(await db.transactions.count()).toBe(0) // never income or expense
    const bal = accountBalances(await db.accounts.toArray(), [], await db.transfers.toArray())
    expect([bal.get(a), bal.get(b)]).toEqual([7500, 2500])
  })

  it('allows an account to go negative (shown, not blocked)', async () => {
    const db = freshDB()
    const a = await createAccount(acc('A'), db)
    const b = await createAccount(acc('B'), db)
    await createTransfer({ fromAccountId: a, toAccountId: b, amount: 500, date: '2026-11-10' }, db)
    const bal = accountBalances(await db.accounts.toArray(), [], await db.transfers.toArray())
    expect(bal.get(a)).toBe(-500)
  })

  it.each([
    ['same account', { toAccountId: 1 }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -100 }],
    ['missing destination', { toAccountId: 999 }],
    ['invalid date', { date: '10/11/2026' }],
  ])('rejects %s', async (_label, patch) => {
    const db = freshDB()
    await createAccount(acc('A'), db)
    await createAccount(acc('B'), db)
    await expect(createTransfer({ fromAccountId: 1, toAccountId: 2, amount: 100, date: '2026-11-10', ...patch }, db))
      .rejects.toBeInstanceOf(LedgerError)
    expect(await db.transfers.count()).toBe(0)
  })

  it('rolls back with the surrounding transaction: no half-applied state', async () => {
    const db = freshDB()
    const a = await createAccount(acc('A'), db)
    const b = await createAccount(acc('B'), db)
    await expect(db.transaction('rw', db.transfers, db.accounts, async () => {
      await createTransfer({ fromAccountId: a, toAccountId: b, amount: 100, date: '2026-11-10' }, db)
      throw new Error('crash mid-operation')
    })).rejects.toThrow('crash mid-operation')
    expect(await db.transfers.count()).toBe(0)
  })

  it('updates and deletes', async () => {
    const db = freshDB()
    const a = await createAccount(acc('A'), db)
    const b = await createAccount(acc('B'), db)
    const id = await createTransfer({ fromAccountId: a, toAccountId: b, amount: 100, date: '2026-11-10', description: 'x' }, db)
    await updateTransfer(id, { fromAccountId: b, toAccountId: a, amount: 300, date: '2026-11-11' }, db)
    const t = await db.transfers.get(id) as Transfer
    expect(t).toMatchObject({ fromAccountId: b, toAccountId: a, amount: 300, date: '2026-11-11' })
    expect(t.description).toBeUndefined()
    expect(t.updatedAt).toBeTypeOf('number')
    await deleteTransfer(id, db)
    expect(await db.transfers.count()).toBe(0)
  })
})

describe('balances', () => {
  const accounts: Account[] = [
    { id: 1, name: 'A', kind: 'checking', icon: '', openingBalance: 1000, openingDate: '2026-03-01', archived: 0, createdAt: 0 },
    { id: 2, name: 'B', kind: 'wallet', icon: '', openingBalance: 0, openingDate: '2026-01-01', archived: 0, createdAt: 0 },
  ]
  const txs = [
    { type: 'income' as const, amount: 500, accountId: 1, date: '2026-02-10' },
    { type: 'expense' as const, amount: 200, accountId: 2, date: '2026-03-10' },
  ]
  const trs = [{ fromAccountId: 1, toAccountId: 2, amount: 300, date: '2026-03-05' }]

  it('counts opening balances from their date, and everything up to asOf', () => {
    expect([...accountBalances(accounts, txs, trs, '2026-02-28')]).toEqual([[1, 500], [2, 0]])
    expect([...accountBalances(accounts, txs, trs, '2026-03-05')]).toEqual([[1, 1200], [2, 300]])
    expect([...accountBalances(accounts, txs, trs)]).toEqual([[1, 1200], [2, 100]])
  })

  it('conserves money: transfers never change the total (randomized)', () => {
    let seed = 42
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n }
    for (let round = 0; round < 50; round++) {
      const accs: Account[] = Array.from({ length: 1 + rnd(5) }, (_, i) => ({
        id: i + 1, name: `${i}`, kind: 'checking', icon: '', openingBalance: rnd(100000) - 50000,
        openingDate: '2026-01-01', archived: 0, createdAt: 0,
      }))
      const t: Pick<Transaction, 'type' | 'amount' | 'accountId' | 'date'>[] = Array.from({ length: rnd(40) }, () => ({
        type: rnd(2) ? 'income' : 'expense', amount: 1 + rnd(99999), accountId: 1 + rnd(accs.length), date: '2026-05-01',
      }))
      const tr = Array.from({ length: rnd(40) }, () => {
        const from = 1 + rnd(accs.length)
        return { fromAccountId: from, toAccountId: (from % accs.length) + 1, amount: 1 + rnd(99999), date: '2026-05-02' }
      }).filter(x => x.fromAccountId !== x.toAccountId)

      const expected = accs.reduce((s, a) => s + a.openingBalance, 0)
        + t.reduce((s, x) => s + (x.type === 'income' ? x.amount : -x.amount), 0)
      expect(sumBalances(accountBalances(accs, t, tr))).toBe(expected)
    }
  })

  it('feeds patrimônio: opening balances move cumulative but not income', () => {
    const all = buildMonthlySeries(
      txs.map(t => ({ ...t })), 2026, 3, 2, balanceAdjustments(accounts, trs, null),
    )
    expect(all.map(p => [p.key, p.income, p.cumulative])).toEqual([['2026-02', 500, 500], ['2026-03', 0, 1300]])

    const onlyB = buildMonthlySeries(
      txs.filter(t => t.accountId === 2), 2026, 3, 2, balanceAdjustments(accounts, trs, [2]),
    )
    expect(onlyB.map(p => p.cumulative)).toEqual([0, 100])

    // A and B together: the transfer between them is internal and cancels out
    const both = buildMonthlySeries(txs.map(t => ({ ...t })), 2026, 3, 2, balanceAdjustments(accounts, trs, [1, 2]))
    expect(both.map(p => p.cumulative)).toEqual(all.map(p => p.cumulative))
  })
})

describe('isISODate', () => {
  it('accepts real dates only', () => {
    expect(isISODate('2024-02-29')).toBe(true)
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('2026-1-01')).toBe(false)
  })
})

describe('v4 → v5 migration', () => {
  it('gives every transaction its report month and Pix (cash in wallets) as method', async () => {
    const name = `ledger-v5-${++seq}`
    const v4 = new Dexie(name)
    v4.version(4).stores({
      categories: '++id, type',
      transactions: '++id, categoryId, accountId, type, date, createdAt, [accountId+date]',
      accounts: '++id, archived',
      transfers: '++id, fromAccountId, toAccountId, date, createdAt',
    })
    await v4.open()
    await v4.table('accounts').bulkAdd([
      { name: 'Banco', kind: 'checking', icon: '🏦', openingBalance: 0, openingDate: '2026-01-01', archived: 0, createdAt: 1 },
      { name: 'Carteira', kind: 'wallet', icon: '👛', openingBalance: 0, openingDate: '2026-01-01', archived: 0, createdAt: 2 },
    ])
    await v4.table('transactions').bulkAdd([
      { type: 'expense', amount: 10, categoryId: 1, accountId: 1, date: '2026-10-31', createdAt: 1 },
      { type: 'expense', amount: 20, categoryId: 1, accountId: 2, date: '2026-11-01', createdAt: 2 },
    ])
    v4.close()
    const db = freshDB(name)
    const txs = await db.transactions.orderBy('id').toArray()
    expect(txs.map(t => [t.month, t.method])).toEqual([['2026-10', 'pix'], ['2026-11', 'cash']])
    expect(await db.purchases.count()).toBe(0)
  })
})

describe('editing transactions', () => {
  it('updates every field and keeps createdAt', async () => {
    const db = freshDB()
    const a = await createAccount(acc('A'), db)
    const b = await createAccount(acc('B'), db)
    const id = await addTransaction({ type: 'expense', amount: 100, categoryId: ALIMENTACAO, accountId: a, method: 'pix', date: '2026-11-10', description: 'x' }, db)
    const before = await db.transactions.get(id) as Transaction
    await updateTransaction(id, { type: 'income', amount: 250, categoryId: SALARIO, accountId: b, method: 'ted', date: '2026-12-01' }, db)
    const after = await db.transactions.get(id) as Transaction
    expect(after).toMatchObject({ type: 'income', amount: 250, accountId: b, method: 'ted', date: '2026-12-01', month: '2026-12', createdAt: before.createdAt })
    expect(after.description).toBeUndefined()
    await deleteTransaction(id, db)
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('credit cards', () => {
  async function setup() {
    const db = freshDB()
    const bank = await createAccount({ ...acc('Nubank', 500000), kind: 'checking' }, db)
    const card = await createAccount({
      ...acc('Nubank Cartão'), kind: 'credit',
      card: { closingDay: 3, dueDay: 10, limit: 1000000, bankAccountId: bank },
    }, db)
    return { db, bank, card }
  }

  it('a card must belong to a bank account', async () => {
    const { db, card } = await setup()
    await expect(createAccount({ ...acc('Sem banco'), kind: 'credit', card: { closingDay: 3, dueDay: 10, bankAccountId: 999 } }, db))
      .rejects.toBeInstanceOf(LedgerError)
    await expect(createAccount({ ...acc('Cartão de cartão'), kind: 'credit', card: { closingDay: 3, dueDay: 10, bankAccountId: card } }, db))
      .rejects.toBeInstanceOf(LedgerError)
    await expect(createAccount({ ...acc('Dia 32'), kind: 'credit', card: { closingDay: 32, dueDay: 10, bankAccountId: 1 } }, db))
      .rejects.toBeInstanceOf(LedgerError)
  })

  it('splits a purchase into installments on consecutive invoices', async () => {
    const { db, card } = await setup()
    const r = await createCardPurchase({ accountId: card, categoryId: ALIMENTACAO, description: 'Notebook', date: '2026-11-12', total: 100000, installments: 3 }, db)
    expect(r.installments.map(i => [i.number, i.amount, i.invoiceMonth])).toEqual([
      [1, 33334, '2026-12'], [2, 33333, '2027-01'], [3, 33333, '2027-02'],
    ])
    const rows = await db.transactions.where('purchaseId').equals(r.purchaseId).toArray()
    expect(rows.every(t => t.method === 'credit' && t.date === '2026-11-12' && t.month === t.invoiceMonth)).toBe(true)
    expect(rows.reduce((s, t) => s + t.amount, 0)).toBe(100000)
  })

  it('card debt (and limit used) includes future installments from the purchase date', async () => {
    const { db, card } = await setup()
    await createCardPurchase({ accountId: card, categoryId: ALIMENTACAO, date: '2026-11-12', total: 120000, installments: 12 }, db)
    const bal = accountBalances(await db.accounts.toArray(), await db.transactions.toArray(), await db.transfers.toArray())
    expect(bal.get(card)).toBe(-120000)
  })

  it('rejects purchases on non-cards, income categories and impossible installment counts', async () => {
    const { db, bank, card } = await setup()
    const base = { accountId: card, categoryId: ALIMENTACAO, date: '2026-11-12', total: 1000, installments: 2 }
    await expect(createCardPurchase({ ...base, accountId: bank }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createCardPurchase({ ...base, categoryId: SALARIO }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createCardPurchase({ ...base, installments: 0 }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createCardPurchase({ ...base, installments: 49 }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createCardPurchase({ ...base, total: 1, installments: 2 }, db)).rejects.toBeInstanceOf(LedgerError)
    expect(await db.purchases.count()).toBe(0)
    expect(await db.transactions.count()).toBe(0)
  })

  it('income/expense directly on a card is refused — card money only enters as purchases', async () => {
    const { db, card } = await setup()
    await expect(addTransaction({ type: 'expense', amount: 100, categoryId: ALIMENTACAO, accountId: card, date: '2026-11-10' }, db))
      .rejects.toBeInstanceOf(LedgerError)
  })

  it('editing a purchase regenerates its installments atomically; deleting removes them all', async () => {
    const { db, card } = await setup()
    const { purchaseId } = await createCardPurchase({ accountId: card, categoryId: ALIMENTACAO, date: '2026-11-12', total: 90000, installments: 3 }, db)
    await updateCardPurchase(purchaseId, { accountId: card, categoryId: ALIMENTACAO, date: '2026-11-01', total: 50000, installments: 2 }, db)
    const rows = await db.transactions.where('purchaseId').equals(purchaseId).sortBy('installment')
    expect(rows.map(r => [r.amount, r.invoiceMonth])).toEqual([[25000, '2026-11'], [25000, '2026-12']])
    // installments can't be edited or deleted one by one
    await expect(deleteTransaction(rows[0].id as number, db)).rejects.toBeInstanceOf(LedgerError)
    await deleteCardPurchase(purchaseId, db)
    expect(await db.transactions.count()).toBe(0)
    expect(await db.purchases.count()).toBe(0)
  })

  it('a failed edit leaves the original installments untouched', async () => {
    const { db, card } = await setup()
    const { purchaseId } = await createCardPurchase({ accountId: card, categoryId: ALIMENTACAO, date: '2026-11-12', total: 90000, installments: 3 }, db)
    const before = await db.transactions.toArray()
    await expect(updateCardPurchase(purchaseId, { accountId: card, categoryId: SALARIO, date: '2026-11-12', total: 90000, installments: 3 }, db))
      .rejects.toBeInstanceOf(LedgerError)
    expect(await db.transactions.toArray()).toEqual(before)
  })

  it('paying the invoice is a transfer: bank down, debt down, patrimônio and expenses unchanged', async () => {
    const { db, bank, card } = await setup()
    await createCardPurchase({ accountId: card, categoryId: ALIMENTACAO, date: '2026-11-12', total: 30000, installments: 1 }, db)
    const accounts = await db.accounts.toArray()
    const before = accountBalances(accounts, await db.transactions.toArray(), await db.transfers.toArray())
    await payInvoice({ cardAccountId: card, invoiceMonth: '2026-12', fromAccountId: bank, amount: 30000, date: '2026-12-10' }, db)
    const txs = await db.transactions.toArray()
    const trs = await db.transfers.toArray()
    const after = accountBalances(accounts, txs, trs)
    expect([before.get(bank), before.get(card)]).toEqual([500000, -30000])
    expect([after.get(bank), after.get(card)]).toEqual([470000, 0])
    expect(sumBalances(after)).toBe(sumBalances(before))
    expect(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)).toBe(30000) // counted once
    expect(trs[0]).toMatchObject({ invoiceMonth: '2026-12', fromAccountId: bank, toAccountId: card })
  })

  it('payments must go into a card, from a non-card account', async () => {
    const { db, bank, card } = await setup()
    await expect(payInvoice({ cardAccountId: bank, invoiceMonth: '2026-12', fromAccountId: card, amount: 1, date: '2026-12-10' }, db))
      .rejects.toBeInstanceOf(LedgerError)
    await expect(createTransfer({ fromAccountId: card, toAccountId: bank, amount: 1, date: '2026-12-10' }, db))
      .rejects.toBeInstanceOf(LedgerError)
    await expect(createTransfer({ fromAccountId: bank, toAccountId: card, amount: 1, date: '2026-12-10', invoiceMonth: '2026-13' }, db))
      .rejects.toBeInstanceOf(LedgerError)
  })

  it('a bank with cards cannot be deleted, and a used account cannot flip into a card', async () => {
    const { db, bank } = await setup()
    const emptyBank = await createAccount(acc('Vazio'), db)
    await expect(deleteAccount(bank, db)).rejects.toBeInstanceOf(LedgerError)
    await addTransaction({ type: 'expense', amount: 1, categoryId: ALIMENTACAO, accountId: emptyBank, date: '2026-11-10' }, db)
    await expect(updateAccount(emptyBank, { ...acc('Vazio'), kind: 'credit', card: { closingDay: 1, dueDay: 8, bankAccountId: bank } }, db))
      .rejects.toBeInstanceOf(LedgerError)
    expect(await accountUsage(bank, db)).toBe(0)
  })
})
