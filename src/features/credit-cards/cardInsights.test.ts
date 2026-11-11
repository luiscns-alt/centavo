import { describe, it, expect } from 'vitest'
import type { Account, Transaction, Transfer } from '../../core/db'
import { buildCardInsights } from './cardInsights'
import { buildCardInvoices } from './cardInvoices'

const acc = (id: number, kind: Account['kind'], extra: Partial<Account> = {}): Account => ({
  id, name: `A${id}`, kind, icon: '', openingBalance: 0, openingDate: '2026-01-01', archived: 0, createdAt: id, ...extra,
})
const card = (id: number, bank: number, extra: Partial<Account> = {}) =>
  acc(id, 'credit', { card: { closingDay: 3, dueDay: 10, limit: 100000, bankAccountId: bank }, ...extra })

let seq = 0
const exp = (accountId: number, amount: number, month: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: ++seq, type: 'expense', amount, categoryId: 6, accountId, date: `${month}-01`, month, createdAt: seq, ...extra,
})
const inst = (accountId: number, amount: number, invoiceMonth: string, date = '2026-10-20'): Transaction =>
  exp(accountId, amount, invoiceMonth, { date, invoiceMonth, method: 'credit', purchaseId: 1, installment: 1, installments: 1 })
const pay = (toAccountId: number, amount: number, invoiceMonth: string, date: string): Transfer =>
  ({ id: ++seq, fromAccountId: 1, toAccountId, amount, date, invoiceMonth, createdAt: seq })

const base = { endYear: 2026, endMonth: 12, n: 3, today: '2026-11-20' }

describe('buildCardInsights', () => {
  const accounts = [acc(1, 'checking'), card(2, 1), acc(3, 'checking'), card(4, 3)]
  const transactions = [
    exp(1, 5000, '2026-11', { method: 'pix' }),
    exp(3, 1000, '2026-12', { method: 'debit' }),
    inst(2, 20000, '2026-11'),
    inst(2, 30000, '2026-12'),
    inst(4, 7000, '2026-12'),
    inst(4, 9000, '2027-01'),
    { ...exp(1, 99999, '2026-11'), type: 'income' } as Transaction,
  ]
  const payments = [pay(2, 20000, '2026-11', '2026-11-10')]

  it('is null when no card is in scope', () => {
    expect(buildCardInsights({ ...base, accounts: [acc(1, 'checking')], transactions: [], payments: [], scopeIds: null })).toBeNull()
    expect(buildCardInsights({ ...base, accounts, transactions, payments, scopeIds: [1] })).toBeNull()
  })

  it('ignores archived cards without history', () => {
    const r = buildCardInsights({ ...base, accounts: [acc(1, 'checking'), card(9, 1, { archived: 1 })], transactions: [], payments: [], scopeIds: null })
    expect(r).toBeNull()
  })

  it('splits monthly expenses into cards (per card) and other methods — and they add up', () => {
    const r = buildCardInsights({ ...base, accounts, transactions, payments, scopeIds: null })!
    expect(r.period).toEqual({ from: '2026-10', to: '2026-12' })
    const nov = r.monthly[1]
    const dec = r.monthly[2]
    expect([nov.expense, nov.card, nov.other]).toEqual([25000, 20000, 5000])
    expect(dec.byCard).toEqual([{ cardId: 2, amount: 30000 }, { cardId: 4, amount: 7000 }])
    for (const m of r.monthly) {
      expect(m.card + m.other).toBe(m.expense)
      expect(m.byCard.reduce((s, b) => s + b.amount, 0)).toBe(m.card)
    }
    expect(nov.cardShare).toBe(0.8)
  })

  it('sums what is still owed across cards per invoice, paid invoices excluded', () => {
    const r = buildCardInsights({ ...base, accounts, transactions, payments, scopeIds: null })!
    expect(r.owed.invoices.map(o => [o.invoiceMonth, o.remaining])).toEqual([['2026-12', 37000], ['2027-01', 9000]])
    expect(r.owed.invoices[0].byCard).toEqual([{ cardId: 2, remaining: 30000 }, { cardId: 4, remaining: 7000 }])
    expect(r.owed.total).toBe(46000)
  })

  it('flags overdue invoices', () => {
    const r = buildCardInsights({ ...base, today: '2026-12-15', accounts, transactions, payments, scopeIds: null })!
    expect(r.owed.invoices.find(o => o.invoiceMonth === '2026-12')?.overdue).toBe(true)
  })

  it('follows the account filter: a bank with its card', () => {
    const r = buildCardInsights({ ...base, accounts, transactions, payments, scopeIds: [3, 4] })!
    expect(r.cards.map(c => c.id)).toEqual([4])
    expect([r.monthly[2].card, r.monthly[2].other]).toEqual([7000, 1000])
    expect(r.owed.total).toBe(16000)
  })

  it("each card row shows the invoice to pay now", () => {
    const r = buildCardInsights({ ...base, accounts, transactions, payments, scopeIds: null })!
    expect(r.cards.map(c => [c.id, c.invoiceMonth, c.remaining])).toEqual([[2, '2026-12', 30000], [4, '2026-12', 7000]])
  })
})

describe('buildCardInvoices', () => {
  it('prefers an unpaid past invoice as the one to pay now', () => {
    const c = card(2, 1) as Account & { card: NonNullable<Account['card']> }
    const l = buildCardInvoices(c, [inst(2, 500, '2026-11'), inst(2, 700, '2026-12')], [], '2026-11-20')
    expect(l.currentInvoice).toBe('2026-12')
    expect(l.dueInvoice.invoiceMonth).toBe('2026-11')
    expect(l.dueInvoice.status).toBe('overdue')
    expect(l.debt).toBe(1200)
    expect(l.available).toBe(100000 - 1200)
  })
})
