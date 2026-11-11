/**
 * Credit-card invoice arithmetic. Pure functions on YYYY-MM-DD / YYYY-MM strings in local
 * calendar terms (no Date/UTC round-trips, so no timezone drift).
 *
 * Rules (agreed):
 *  - An invoice is named by the month of its DUE date ("fatura de dezembro" vence em dezembro).
 *  - A purchase ON the closing day goes to the next invoice ("melhor dia de compra").
 *  - Days 29–31 clamp to the month's last day.
 *  - Installment k lands on the first installment's invoice + (k − 1) months.
 */
import { addMonths, dayIn, parseYM, ymKey } from '../../shared/utils/dates'


export interface InvoiceRef {
  /** YYYY-MM of the due date — the invoice's name */
  invoiceMonth: string
  closingDate: string
  dueDate: string
}

/** Due month = closing month if the due day comes after the closing day, else the next month */
const dueOffset = (closingDay: number, dueDay: number) => (dueDay > closingDay ? 0 : 1)

/** Closing and due dates of a given invoice */
export function invoiceDates(invoiceMonth: string, closingDay: number, dueDay: number): InvoiceRef {
  const due = parseYM(invoiceMonth)
  const closing = addMonths(due, -dueOffset(closingDay, dueDay))
  return { invoiceMonth, closingDate: dayIn(closing, closingDay), dueDate: dayIn(due, dueDay) }
}

/** The invoice a purchase made on `date` belongs to */
export function invoiceFor(date: string, closingDay: number, dueDay: number): InvoiceRef {
  const ym = parseYM(date)
  // Before this month's closing → closes this month; on/after it → closes next month
  const closingYM = date < dayIn(ym, closingDay) ? ym : addMonths(ym, 1)
  const dueYM = addMonths(closingYM, dueOffset(closingDay, dueDay))
  return invoiceDates(ymKey(dueYM), closingDay, dueDay)
}

/**
 * Split a total (integer centavos) into n installments. The first one absorbs the remainder,
 * like card statements do: 100000 / 3 → [33334, 33333, 33333]. Always sums exactly to total.
 */
export function splitInstallments(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const rest = total - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base))
}

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'partial' | 'overdue' | 'future' | 'empty'

/**
 * Derived status of an invoice on `today`.
 *  future: closing not reached and not the current cycle (only installments scheduled)
 *  open: current cycle, before closing · closed: after closing, before due, unpaid
 *  partial: something paid, something left (before due) · overdue: past due with balance
 *  paid: nothing left · empty: no charges
 */
export function invoiceStatus(
  ref: InvoiceRef, total: number, paid: number, today: string, currentInvoiceMonth: string,
): InvoiceStatus {
  const remaining = total - paid
  if (total <= 0 && paid <= 0) return 'empty'
  if (remaining <= 0) return 'paid'
  if (today > ref.dueDate) return 'overdue'
  if (today >= ref.closingDate) return paid > 0 ? 'partial' : 'closed'
  if (ref.invoiceMonth === currentInvoiceMonth) return paid > 0 ? 'partial' : 'open'
  return 'future'
}
