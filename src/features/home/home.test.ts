import 'fake-indexeddb/auto' // must load before Dexie
import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { CentavoDB } from '../../core/db'
import { createAccount } from '../accounts'
import { setBudget } from '../budgets'
import { createCardPurchase, payInvoice } from '../credit-cards'
import { createLoan } from '../loans'
import { addTransaction } from '../transactions'
import { buildHomeSummary, loadHomeSummary } from './home'

const opened: Dexie[] = []
let seq = 0
function freshDB(): CentavoDB {
  const db = new CentavoDB(`home-test-${++seq}`)
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
const TRANSPORTE = 7
const TODAY = '2026-11-10'

async function setup() {
  const db = freshDB()
  const bank = await createAccount({ name: 'Banco', kind: 'checking', openingBalance: 500_000, openingDate: '2026-01-01' }, db)
  const wallet = await createAccount({ name: 'Carteira', kind: 'wallet', openingBalance: 50_000, openingDate: '2026-01-01' }, db)
  // due 13/11 (in 3 days) · due 08/11 (overdue) · due 05/12 (next month)
  const soon = await createAccount({ name: 'Roxinho', kind: 'credit', openingBalance: 0, openingDate: '2026-01-01', card: { closingDay: 3, dueDay: 13, bankAccountId: bank } }, db)
  const late = await createAccount({ name: 'Laranja', kind: 'credit', openingBalance: 0, openingDate: '2026-01-01', card: { closingDay: 1, dueDay: 8, bankAccountId: bank } }, db)
  const later = await createAccount({ name: 'Azul', kind: 'credit', openingBalance: 0, openingDate: '2026-01-01', card: { closingDay: 28, dueDay: 5, bankAccountId: wallet } }, db)
  await createCardPurchase({ accountId: soon, categoryId: ALIMENTACAO, date: '2026-10-20', total: 100_000, installments: 1 }, db)
  await createCardPurchase({ accountId: late, categoryId: TRANSPORTE, date: '2026-10-15', total: 30_000, installments: 1 }, db)
  await createCardPurchase({ accountId: later, categoryId: TRANSPORTE, date: '2026-11-02', total: 80_000, installments: 1 }, db)
  await addTransaction({ type: 'expense', amount: 20_000, categoryId: ALIMENTACAO, accountId: wallet, date: '2026-11-04' }, db)
  return { db, bank, wallet, soon, late, later }
}

describe('home summary', () => {
  it('available counts cash accounts only; the outlook subtracts what is due by month end', async () => {
    const { db } = await setup()
    const s = await loadHomeSummary(TODAY, null, db)
    expect(s.available.total).toBe(550_000 - 20_000)
    expect(s.available.accounts.map(a => a.name)).toEqual(['Banco', 'Carteira'])
    expect(s.outlook.dueThisMonth).toEqual({ invoices: 100_000 + 30_000, loans: 0, recurring: null }) // Azul is due in December
    expect(s.outlook.projectedFree).toBe(530_000 - 130_000)
    expect(s.cards.items.map(c => [c.name, c.remaining, c.overdue])).toEqual([['Roxinho', 100_000, false], ['Laranja', 30_000, true], ['Azul', 80_000, false]])
  })

  it('alerts: overdue first, then negative/over, due soon, warnings', async () => {
    const { db, soon } = await setup()
    await setBudget({ categoryId: ALIMENTACAO, from: '2026-11', amount: 15_000 }, db) // wallet expense 20k → over
    await setBudget({ categoryId: TRANSPORTE, from: '2026-11', amount: 34_000 }, db)  // Laranja 30k in Nov invoice → 88%
    const s = await loadHomeSummary(TODAY, null, db)
    expect(s.alerts.map(a => a.kind)).toEqual(['invoice_overdue', 'budget_over', 'invoice_due', 'budget_warning'])
    expect(s.alerts[2]).toMatchObject({ title: 'Fatura Roxinho vence em 3 dias', target: { screen: 'card', id: soon } })
    expect(s.health.status).toBe('critical')
    expect(s.budgets).toMatchObject({ has: true, alertCount: 2 })
  })

  it('a paid invoice leaves the outlook and its alert', async () => {
    const { db, bank, soon, late } = await setup()
    await payInvoice({ cardAccountId: soon, fromAccountId: bank, invoiceMonth: '2026-11', amount: 100_000, date: '2026-11-09' }, db)
    await payInvoice({ cardAccountId: late, fromAccountId: bank, invoiceMonth: '2026-11', amount: 30_000, date: '2026-11-09' }, db)
    const s = await loadHomeSummary(TODAY, null, db)
    expect(s.outlook.dueThisMonth.invoices).toBe(0)
    expect(s.alerts).toEqual([])
    expect(s.health).toEqual({ status: 'ok', reason: 'Tudo em dia' })
    expect(s.available.total).toBe(530_000 - 130_000)
  })

  it('negative account and overdue loan installments', async () => {
    const { db, wallet } = await setup()
    await addTransaction({ type: 'expense', amount: 40_000, categoryId: TRANSPORTE, accountId: wallet, date: '2026-11-09' }, db)
    await createLoan({
      name: 'Moto', type: 'vehicle', principal: 1_200_000, rate: { value: '1', unit: 'monthly' }, termMonths: 12, system: 'price',
      startDate: '2026-09-01', firstDueDate: '2026-10-05', release: 'direct', payFromAccountId: wallet,
      principalCategoryId: TRANSPORTE, interestCategoryId: ALIMENTACAO,
    }, db)
    const s = await loadHomeSummary(TODAY, null, db)
    const kinds = s.alerts.map(a => a.kind)
    expect(kinds.filter(k => k === 'loan_overdue')).toHaveLength(2)
    expect(kinds).toContain('account_negative') // wallet: 50k − 20k − 40k
    expect(s.outlook.dueThisMonth.loans).toBe(2 * s.loans[0].next!.total)
    expect([s.loans[0].name, s.loans[0].next?.n, s.loans[0].next?.overdue]).toEqual(['Moto', 1, true])
  })

  it('the account filter narrows accounts, cards and loans — budgets stay global', async () => {
    const { db, wallet, later } = await setup()
    const s = await loadHomeSummary(TODAY, [wallet, later], db)
    expect(s.available.total).toBe(30_000)
    expect(s.cards.items.map(c => c.name)).toEqual(['Azul'])
    expect(s.outlook.dueThisMonth.invoices).toBe(0)
  })

  it('100k transactions computed in well under 150 ms', () => {
    const accounts = [1, 2, 3].map(id => ({ id, name: `A${id}`, kind: 'checking' as const, icon: '🏦', openingBalance: 0, openingDate: '2020-01-01', archived: 0 as const, createdAt: id }))
    const transactions = Array.from({ length: 100_000 }, (_, i) => {
      const date = `20${20 + (i % 7)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`
      return { id: i, type: (i % 5 === 0 ? 'income' : 'expense') as 'income' | 'expense', amount: 100 + (i % 9000), categoryId: 6, accountId: 1 + (i % 3), date, month: date.slice(0, 7), createdAt: i }
    })
    const input = { today: TODAY, scope: null, accounts, transactions, transfers: [], loans: [], loanEvents: [], categories: [], budgets: [], budgetOverrides: [] }
    buildHomeSummary(input)
    const t0 = performance.now()
    const s = buildHomeSummary(input)
    expect(performance.now() - t0).toBeLessThan(150)
    expect(s.available.accounts).toHaveLength(3)
  })
})
