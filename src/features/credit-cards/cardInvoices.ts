import { expenseDelta, type Account, type CardSettings, type Transaction, type Transfer } from '../../core/db'
import { addMonthsKey, invoiceDates, invoiceFor, invoiceStatus, type InvoiceRef, type InvoiceStatus } from './invoice'

export interface CardInvoice extends InvoiceRef {
  total: number
  paid: number
  /** total − paid; negative = credit left on the invoice */
  remaining: number
  status: InvoiceStatus
  items: Transaction[]
  payments: Transfer[]
}

export interface CardLedger {
  /** Invoice containing today */
  currentInvoice: string
  /** The invoice to pay now: the oldest past one still owing, else the current one */
  dueInvoice: CardInvoice
  /** From the oldest invoice with activity to the last booked installment (at least current ± 1) */
  invoices: CardInvoice[]
  /** Total owed, future installments included */
  debt: number
  available: number | null
}

/** A payment without an invoice tag counts toward the invoice open on its date */
const paymentInvoice = (t: Transfer, c: CardSettings) => t.invoiceMonth ?? invoiceFor(t.date, c.closingDay, c.dueDay).invoiceMonth

/**
 * Every invoice of one card, derived from its installments and payments (nothing is stored).
 * `txs` = the card's transactions, `payments` = transfers into the card.
 */
export function buildCardInvoices(card: Account & { card: CardSettings }, txs: Transaction[], payments: Transfer[], today: string): CardLedger {
  const c = card.card
  const currentInvoice = invoiceFor(today, c.closingDay, c.dueDay).invoiceMonth

  const months = new Set<string>([addMonthsKey(currentInvoice, -1), currentInvoice, addMonthsKey(currentInvoice, 1)])
  txs.forEach(t => t.invoiceMonth && months.add(t.invoiceMonth))
  payments.forEach(t => months.add(paymentInvoice(t, c)))
  const sorted = [...months].sort()
  const all: string[] = []
  for (let m = sorted[0]; m <= sorted[sorted.length - 1]; m = addMonthsKey(m, 1)) all.push(m)

  const invoices: CardInvoice[] = all.map(m => {
    const ref = invoiceDates(m, c.closingDay, c.dueDay)
    const items = txs.filter(t => t.invoiceMonth === m).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    const pays = payments.filter(t => paymentInvoice(t, c) === m)
    const total = items.reduce((s, t) => s + expenseDelta(t), 0) // a refund is a credit on the invoice
    const paid = pays.reduce((s, t) => s + t.amount, 0)
    return { ...ref, total, paid, remaining: total - paid, status: invoiceStatus(ref, total, paid, today, currentInvoice), items, payments: pays }
  })

  const dueInvoice =
    invoices.find(i => i.invoiceMonth < currentInvoice && i.remaining > 0) ??
    invoices.find(i => i.invoiceMonth === currentInvoice)!

  // Debt = −balance: opening balance (negative = owed) − installments + payments
  const spent = txs.reduce((s, t) => s + (t.type === 'expense' ? t.amount : -t.amount), 0)
  const paidAll = payments.reduce((s, t) => s + t.amount, 0)
  const debt = spent - paidAll - card.openingBalance
  return { currentInvoice, dueInvoice, invoices, debt, available: c.limit === undefined ? null : c.limit - debt }
}
