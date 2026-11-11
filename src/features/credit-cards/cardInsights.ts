/**
 * Comparativo → Cartões: how much the cards weigh on spending, what is still owed on their
 * invoices, and each card's current invoice. Pure: the hook reads, this computes.
 */
import { buildCardInvoices } from './cardInvoices'
import type { InvoiceStatus } from './invoice'
import { expenseDelta } from '../../core/amounts'
import type { Account, CardSettings, Transaction, Transfer } from '../../core/types'
import { monthKey, monthWindow } from '../../shared/utils/dates'

type Card = Account & { id: number; card: CardSettings }

export interface CardMonth {
  month: string
  /** All expenses of the month in scope (= Saídas of the chart above) */
  expense: number
  /** Expenses on cards — the invoices due that month */
  card: number
  /** Pix, débito, boleto… everything not on a card */
  other: number
  cardShare: number
  /** One entry per card in scope, in card order (amount may be 0) */
  byCard: { cardId: number; amount: number }[]
}

export interface OwedInvoice {
  invoiceMonth: string
  remaining: number
  overdue: boolean
  byCard: { cardId: number; remaining: number }[]
}

export interface CardRowInsight {
  id: number
  name: string
  icon: string
  bankId?: string
  invoiceMonth: string
  dueDate: string
  total: number
  remaining: number
  status: InvoiceStatus
  available: number | null
}

export interface CardInsights {
  period: { from: string; to: string }
  cards: CardRowInsight[]
  monthly: CardMonth[]
  owed: { total: number; invoices: OwedInvoice[] }
}

interface Input {
  accounts: Account[]
  /** All transactions (filtered by report month here) */
  transactions: Transaction[]
  /** Transfers into cards (payments) */
  payments: Transfer[]
  /** Account filter: null = everything */
  scopeIds: number[] | null
  endYear: number
  endMonth: number
  n: number
  today: string
}

/** null = no card in scope → the section is not shown */
export function buildCardInsights({ accounts, transactions, payments, scopeIds, endYear, endMonth, n, today }: Input): CardInsights | null {
  const inScope = (id: number) => scopeIds === null || scopeIds.includes(id)
  const used = new Set([...transactions.map(t => t.accountId), ...payments.map(t => t.toAccountId)])
  const cards = accounts.filter((a): a is Card =>
    a.kind === 'credit' && !!a.card && a.id != null && inScope(a.id) && (!a.archived || used.has(a.id)))
  if (cards.length === 0) return null

  const cardIds = new Set(cards.map(c => c.id))
  const window = monthWindow(endYear, endMonth, n).map(({ year, month }) => monthKey(year, month))
  const inWindow = new Set(window)

  // ── Monthly split: card invoices vs every other way money left
  const monthly = new Map<string, CardMonth>(window.map(m => [m, {
    month: m, expense: 0, card: 0, other: 0, cardShare: 0, byCard: cards.map(c => ({ cardId: c.id, amount: 0 })),
  }]))
  for (const t of transactions) {
    if (t.type === 'income' || !inWindow.has(t.month) || !inScope(t.accountId)) continue
    const v = expenseDelta(t) // refunds count negative
    const m = monthly.get(t.month)!
    m.expense += v
    if (cardIds.has(t.accountId)) {
      m.card += v
      m.byCard.find(b => b.cardId === t.accountId)!.amount += v
    } else {
      m.other += v
    }
  }
  for (const m of monthly.values()) m.cardShare = m.expense > 0 ? m.card / m.expense : 0

  // ── Invoices per card (shared with the card screen)
  const ledgers = cards.map(card => ({
    card,
    ledger: buildCardInvoices(
      card,
      transactions.filter(t => t.accountId === card.id),
      payments.filter(t => t.toAccountId === card.id),
      today,
    ),
  }))

  // ── Still to pay: every invoice with something left, summed across cards per invoice month
  const owedByMonth = new Map<string, OwedInvoice>()
  for (const { card, ledger } of ledgers) {
    for (const inv of ledger.invoices) {
      if (inv.remaining <= 0) continue
      const o = owedByMonth.get(inv.invoiceMonth) ?? { invoiceMonth: inv.invoiceMonth, remaining: 0, overdue: false, byCard: [] }
      o.remaining += inv.remaining
      o.overdue ||= inv.status === 'overdue'
      o.byCard.push({ cardId: card.id, remaining: inv.remaining })
      owedByMonth.set(inv.invoiceMonth, o)
    }
  }
  const owedInvoices = [...owedByMonth.values()].sort((a, b) => (a.invoiceMonth < b.invoiceMonth ? -1 : 1))

  const rows: CardRowInsight[] = ledgers.map(({ card, ledger }) => ({
    id: card.id,
    name: card.name,
    icon: card.icon,
    bankId: card.bankId,
    invoiceMonth: ledger.dueInvoice.invoiceMonth,
    dueDate: ledger.dueInvoice.dueDate,
    total: ledger.dueInvoice.total,
    remaining: ledger.dueInvoice.remaining,
    status: ledger.dueInvoice.status,
    available: ledger.available,
  }))

  return {
    period: { from: window[0], to: window[window.length - 1] },
    cards: rows,
    monthly: window.map(m => monthly.get(m)!),
    owed: { total: owedInvoices.reduce((s, o) => s + o.remaining, 0), invoices: owedInvoices },
  }
}
