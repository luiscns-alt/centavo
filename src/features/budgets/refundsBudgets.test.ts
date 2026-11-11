import 'fake-indexeddb/auto' // must load before Dexie
import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { CentavoDB, CategoryError, addCategory, deleteCategory, sortCategories, updateCategory } from '../../core/db'
import { LedgerError } from '../../core/ledger/base'
import { createAccount, accountBalances } from '../accounts'
import { saveBudget, setBudget, setBudgetOverride } from './ledger'
import { createCardPurchase, deleteCardPurchase, updateCardPurchase, buildCardInvoices } from '../credit-cards'
import { addTransaction, createRefund, deleteTransaction, updateTransaction } from '../transactions'
import { buildMonthlySeries } from '../analytics'
import { limitFor } from './budgets'
import { createBackup, parseBackup, restoreBackup, BackupError } from '../settings'

const opened: Dexie[] = []
let seq = 0
function freshDB(): CentavoDB {
  const db = new CentavoDB(`rb-test-${++seq}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await Dexie.delete(db.name)
  }
})

const ALIMENTACAO = 6
const SALARIO = 1

describe('subcategories', () => {
  it('two levels, same type, parents first in display order', async () => {
    const db = freshDB()
    const delivery = await addCategory({ name: 'Delivery', icon: '🛵', type: 'expense', parentId: ALIMENTACAO }, db)
    expect((await db.categories.get(delivery))?.parentId).toBe(ALIMENTACAO)
    await expect(addCategory({ name: 'Sushi', icon: '🍣', type: 'expense', parentId: delivery }, db)).rejects.toBeInstanceOf(CategoryError)
    await expect(addCategory({ name: 'Bônus x', icon: '🎉', type: 'income', parentId: ALIMENTACAO }, db)).rejects.toBeInstanceOf(CategoryError)
    const sorted = sortCategories(await db.categories.where('type').equals('expense').toArray()).map(c => c.name)
    expect(sorted.indexOf('Delivery')).toBe(sorted.indexOf('Alimentação') + 1)
  })

  it('moves a category under another and back; a parent with children cannot move or be deleted', async () => {
    const db = freshDB()
    const mercado = (await db.categories.filter(c => c.name === 'Mercado').first())!.id!
    await updateCategory(mercado, { name: 'Mercado', icon: '🛒', parentId: ALIMENTACAO }, db)
    expect((await db.categories.get(mercado))?.parentId).toBe(ALIMENTACAO)
    await expect(updateCategory(ALIMENTACAO, { name: 'Alimentação', icon: '🍔', parentId: 7 }, db)).rejects.toBeInstanceOf(CategoryError)
    await expect(deleteCategory(ALIMENTACAO, db)).rejects.toBeInstanceOf(CategoryError)
    await updateCategory(mercado, { name: 'Mercado', icon: '🛒', parentId: null }, db)
    expect(await db.categories.get(mercado)).not.toHaveProperty('parentId')
  })
})

describe('refunds', () => {
  async function setup() {
    const db = freshDB()
    const bank = await createAccount({ name: 'Banco', kind: 'checking', openingBalance: 100_000, openingDate: '2026-01-01' }, db)
    const card = await createAccount({ name: 'Cartão', kind: 'credit', openingBalance: 0, openingDate: '2026-01-01', card: { closingDay: 3, dueDay: 10, bankAccountId: bank } }, db)
    return { db, bank, card }
  }

  it('an account refund raises the balance and lowers the month spending — never income', async () => {
    const { db, bank } = await setup()
    const exp = await addTransaction({ type: 'expense', amount: 20_000, categoryId: ALIMENTACAO, accountId: bank, method: 'pix', date: '2026-11-05' }, db)
    await createRefund({ of: { kind: 'tx', id: exp }, amount: 5_000, date: '2026-11-08' }, db)
    const txs = await db.transactions.toArray()
    const bal = accountBalances(await db.accounts.toArray(), txs, [])
    expect(bal.get(bank)).toBe(100_000 - 20_000 + 5_000)
    const s = buildMonthlySeries(txs, 2026, 11, 1)
    expect([s[0].income, s[0].expense]).toEqual([0, 15_000])
  })

  it('never refunds more than the original, nor income, and protects the original', async () => {
    const { db, bank } = await setup()
    const exp = await addTransaction({ type: 'expense', amount: 10_000, categoryId: ALIMENTACAO, accountId: bank, date: '2026-11-05' }, db)
    const inc = await addTransaction({ type: 'income', amount: 10_000, categoryId: SALARIO, accountId: bank, date: '2026-11-05' }, db)
    await createRefund({ of: { kind: 'tx', id: exp }, amount: 6_000, date: '2026-11-06' }, db)
    await expect(createRefund({ of: { kind: 'tx', id: exp }, amount: 4_001, date: '2026-11-06' }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createRefund({ of: { kind: 'tx', id: inc }, amount: 1, date: '2026-11-06' }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(createRefund({ of: { kind: 'tx', id: exp }, amount: 1, date: '2026-11-04' }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(deleteTransaction(exp, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(updateTransaction(exp, { type: 'expense', amount: 5_000, categoryId: ALIMENTACAO, accountId: bank, date: '2026-11-05' }, db)).rejects.toBeInstanceOf(LedgerError)
    // deleting the refund gives the spending back
    const refund = (await db.transactions.where('refundOf').equals(exp).first())!
    await deleteTransaction(refund.id!, db)
    await deleteTransaction(exp, db)
  })

  it('a card refund is a credit on the invoice open at the refund date', async () => {
    const { db, card } = await setup()
    const { purchaseId } = await createCardPurchase({ accountId: card, categoryId: ALIMENTACAO, date: '2026-11-12', total: 240_000, installments: 12 }, db)
    await createRefund({ of: { kind: 'purchase', id: purchaseId }, amount: 30_000, date: '2026-12-15' }, db)
    const refund = (await db.transactions.where('refundOfPurchase').equals(purchaseId).first())!
    expect([refund.invoiceMonth, refund.month, refund.method]).toEqual(['2027-01', '2027-01', 'credit'])
    const acc = (await db.accounts.get(card))!
    const l = buildCardInvoices(acc as never, await db.transactions.where('accountId').equals(card).toArray(), [], '2026-12-20')
    expect(l.invoices.find(i => i.invoiceMonth === '2027-01')!.total).toBe(20_000 - 30_000)
    expect(l.debt).toBe(240_000 - 30_000)
    await expect(createRefund({ of: { kind: 'purchase', id: purchaseId }, amount: 210_001, date: '2026-12-15' }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(deleteCardPurchase(purchaseId, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(updateCardPurchase(purchaseId, { accountId: card, categoryId: ALIMENTACAO, date: '2026-11-12', total: 20_000, installments: 1 }, db)).rejects.toBeInstanceOf(LedgerError)
  })
})

describe('budgets', () => {
  it('versions by month and one-off overrides', async () => {
    const db = freshDB()
    await setBudget({ categoryId: ALIMENTACAO, from: '2026-11', amount: 80_000 }, db)
    await setBudget({ categoryId: ALIMENTACAO, from: '2026-12', amount: 90_000 }, db)
    await setBudget({ categoryId: ALIMENTACAO, from: '2026-12', amount: 95_000 }, db) // same month replaces
    await setBudgetOverride({ categoryId: ALIMENTACAO, month: '2027-01', amount: 120_000 }, db)
    await setBudgetOverride({ categoryId: ALIMENTACAO, month: '2027-01', amount: 130_000 }, db)
    expect((await db.budgets.toArray()).map(b => [b.from, b.amount])).toEqual([['2026-11', 80_000], ['2026-12', 95_000]])
    expect((await db.budgetOverrides.toArray()).map(o => [o.month, o.amount])).toEqual([['2027-01', 130_000]])
    await setBudgetOverride({ categoryId: ALIMENTACAO, month: '2027-01', amount: null }, db)
    expect(await db.budgetOverrides.count()).toBe(0)
    await expect(setBudget({ categoryId: SALARIO, from: '2026-11', amount: 1 }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(setBudget({ categoryId: ALIMENTACAO, from: '2026-13', amount: 1 }, db)).rejects.toBeInstanceOf(LedgerError)
  })

  it('deleting a category removes its budgets', async () => {
    const db = freshDB()
    const c = await addCategory({ name: 'Hobby', icon: '🎸', type: 'expense' }, db)
    await setBudget({ categoryId: c, from: '2026-11', amount: 10_000 }, db)
    await deleteCategory(c, db)
    expect(await db.budgets.count()).toBe(0)
  })
})

describe('backup with subcategories, refunds and budgets', () => {
  it('round-trips and rejects a refund larger than its expense', async () => {
    const db = freshDB()
    const bank = await createAccount({ name: 'Banco', kind: 'checking', openingBalance: 0, openingDate: '2026-01-01' }, db)
    await addCategory({ name: 'Delivery', icon: '🛵', type: 'expense', parentId: ALIMENTACAO }, db)
    const exp = await addTransaction({ type: 'expense', amount: 10_000, categoryId: ALIMENTACAO, accountId: bank, date: '2026-11-05' }, db)
    await createRefund({ of: { kind: 'tx', id: exp }, amount: 4_000, date: '2026-11-06' }, db)
    await setBudget({ categoryId: ALIMENTACAO, from: '2026-11', amount: 80_000 }, db)
    await setBudgetOverride({ categoryId: ALIMENTACAO, month: '2026-12', amount: 100_000 }, db)

    const backup = parseBackup(JSON.stringify(await createBackup(db)))
    const target = freshDB()
    await restoreBackup(backup, target)
    for (const t of ['categories', 'transactions', 'budgets', 'budgetOverrides'] as const) {
      expect(await target[t].toArray()).toEqual(await db[t].toArray())
    }

    const bad = await createBackup(db)
    bad.transactions.find(t => t.type === 'refund')!.amount = 10_001
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(BackupError)
  })
})

describe('saveBudget', () => {
  it('"from" replaces this month\'s exception; removal ends the budget from that month', async () => {
    const db = freshDB()
    await saveBudget({ categoryId: ALIMENTACAO, month: '2026-10', amount: 50_000, scope: 'from' }, db)
    await saveBudget({ categoryId: ALIMENTACAO, month: '2026-11', amount: 70_000, scope: 'once' }, db)
    const lim = async (m: string) => limitFor(ALIMENTACAO, m, await db.budgets.toArray(), await db.budgetOverrides.toArray()).amount
    expect([await lim('2026-11'), await lim('2026-12')]).toEqual([70_000, 50_000])
    await saveBudget({ categoryId: ALIMENTACAO, month: '2026-11', amount: 60_000, scope: 'from' }, db)
    expect([await lim('2026-10'), await lim('2026-11'), await lim('2026-12')]).toEqual([50_000, 60_000, 60_000])
    await saveBudget({ categoryId: ALIMENTACAO, month: '2026-12', amount: null, scope: 'from' }, db)
    expect([await lim('2026-11'), await lim('2026-12')]).toEqual([60_000, null])
  })
})
