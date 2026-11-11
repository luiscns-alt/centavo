import type { BalanceAdjustment } from '../accounts'
import { expenseDelta, signedAmount } from '../../core/amounts'
import type { Transaction } from '../../core/types'
import { monthKey, monthWindow } from '../../shared/utils/dates'

/** One month of the income/expense series. All amounts are integer centavos. */
export interface MonthPoint {
  year: number
  month: number // 1-12
  /** "YYYY-MM" — matches the prefix of Transaction.date */
  key: string
  income: number
  expense: number
  /** income − expense for this month */
  net: number
  /** Saldo acumulado (patrimônio): everything up to the end of this month — history before the window, opening balances and, for a single account, transfers */
  cumulative: number
  /** Whether the month has at least one transaction */
  hasData: boolean
}


/** Months between two (year, month) pairs: positive when b is after a */
export const monthDiff = (a: { year: number; month: number }, b: { year: number; month: number }) =>
  (b.year * 12 + b.month) - (a.year * 12 + a.month)

/**
 * Aggregate transactions into a monthly series for the window of `n` months ending at
 * (endYear, endMonth). Transactions after the window are ignored; those before it only
 * feed the opening balance of `cumulative`.
 */
export function buildMonthlySeries(
  transactions: (Pick<Transaction, 'type' | 'amount' | 'date'> & { month?: string })[],
  endYear: number,
  endMonth: number,
  n: number,
  /** Opening balances / transfers: move `cumulative` but are not income or expense */
  adjustments: BalanceAdjustment[] = [],
): MonthPoint[] {
  const window = monthWindow(endYear, endMonth, n)
  const firstKey = monthKey(window[0].year, window[0].month)
  const lastKey = monthKey(endYear, endMonth)

  const points = new Map<string, MonthPoint>(
    window.map(({ year, month }) => {
      const key = monthKey(year, month)
      return [key, { year, month, key, income: 0, expense: 0, net: 0, cumulative: 0, hasData: false }]
    }),
  )

  // Two clocks: income/expense count in their report `month` (a card installment counts in its
  // invoice's month), while the balance moves on `date` (the debt exists from the purchase on).
  let opening = 0
  const balanceByMonth = new Map<string, number>()
  const addBalance = (key: string, v: number) => {
    if (key < firstKey) opening += v
    else if (key <= lastKey) balanceByMonth.set(key, (balanceByMonth.get(key) ?? 0) + v)
  }

  for (const tx of transactions) {
    const signed = signedAmount(tx)
    addBalance(tx.date.slice(0, 7), signed)

    const p = points.get(tx.month ?? tx.date.slice(0, 7))
    if (!p) continue
    if (tx.type === 'income') p.income += tx.amount
    else p.expense += expenseDelta(tx) // refunds lower the month's spending
    p.net += signed
    p.hasData = true
  }

  for (const a of adjustments) addBalance(a.date.slice(0, 7), a.amount)

  let running = opening
  const series = [...points.values()]
  for (const p of series) {
    running += balanceByMonth.get(p.key) ?? 0
    p.cumulative = running
  }
  return series
}

/**
 * Saldo livre carried into `month` (YYYY-MM): what was left from every earlier month, so a month
 * that spends a previous surplus doesn't look like a loss.
 *
 *   carry = opening balances of cash accounts dated before `month`
 *         + Σ (income − expenses) of every earlier report month   (refunds give back)
 *
 * Same rules as Saldo livre: card purchases count in their invoice month; transfers (including
 * invoice payments and loan releases) never count. So it can differ from "Disponível hoje", which
 * is the money in the accounts right now.
 */
export function carryInto(
  month: string,
  transactions: Pick<Transaction, 'type' | 'amount' | 'month'>[],
  openings: { amount: number; date: string }[],
): number {
  let carry = 0
  for (const o of openings) if (o.date.slice(0, 7) < month) carry += o.amount
  for (const t of transactions) {
    if (t.month >= month) continue
    carry += t.type === 'income' ? t.amount : -expenseDelta(t)
  }
  return carry
}
