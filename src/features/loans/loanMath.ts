/**
 * Loan engine: Price and SAC schedules, daily pro-rata interest and extra amortization.
 * Pure and deterministic: same contract + same events → same numbers, so stored snapshots can
 * be re-verified (backup validation replays them).
 *
 * Rules (agreed):
 *  - Money in integer centavos; rates in fixed-point Dec. Every period's interest is rounded to
 *    the centavo, half up. Price payment rounded half up; SAC amortization = ⌊principal / n⌋.
 *  - The last installment absorbs the residue: the balance always ends at exactly 0.
 *  - Annual rates convert by compound equivalence: i_m = (1 + i_a)^(1/12) − 1.
 *  - A regular period counts as 30 days. Interest for d days = B·((1+i)^(d/30) − 1); for a full
 *    period that is exactly B·i.
 *  - Prepayment pays the interest accrued since the period started (pro-rata), the rest
 *    amortizes; then either the term shrinks (payment kept) or the payment shrinks (term kept).
 */
import { ONE, ZERO, add, centavosTimes, dec, div, format, fromInt, mul, nthRoot, powInt, sub, type Dec } from '../../core/decimal'
import { addMonths, dayIn, parseYM } from '../credit-cards'

export type AmortizationSystem = 'price' | 'sac'
export type RateUnit = 'monthly' | 'annual'

export interface LoanTerms {
  principal: number          // centavos
  rate: { value: string; unit: RateUnit } // percent, as typed ("0,7974")
  termMonths: number
  system: AmortizationSystem
  startDate: string          // YYYY-MM-DD
  firstDueDate: string       // YYYY-MM-DD
  monthlyFees?: number       // centavos per installment (insurance, admin fee)
}

/** Where the contract stands after the last recorded event — everything the next step needs */
export interface LoanState {
  balance: number            // outstanding principal, centavos
  next: number               // number of the next installment (1-based)
  remaining: number          // installments left
  payment: number            // Price: current fixed payment (interest + principal)
  amortization: number       // SAC: current fixed amortization
  accruedDays: number        // days of the current period whose interest was already paid (prepayments)
}

export interface InstallmentCalc {
  n: number
  dueDate: string
  interest: number
  principal: number
  fees: number
  /** interest + principal + fees — what leaves the bank account */
  total: number
  balanceAfter: number
}

export type PrepaymentMode = 'reduce-term' | 'reduce-payment'

const MAX_TERM = 600

// ─── Rates ──────────────────────────────────────────────────────────────────

const rateCache = new Map<string, Dec>()

/** Monthly effective rate as a fraction (0.01 = 1% a.m.) */
export function monthlyRate(rate: LoanTerms['rate']): Dec {
  const key = `${rate.unit}:${rate.value}`
  const cached = rateCache.get(key)
  if (cached !== undefined) return cached
  const pct = dec(rate.value)
  if (pct < ZERO) throw new Error('Taxa negativa')
  const frac = div(pct, fromInt(100))
  const monthly = rate.unit === 'monthly' ? frac : sub(nthRoot(add(ONE, frac), 12), ONE)
  rateCache.set(key, monthly)
  return monthly
}

/** "0.7967" style display of the monthly rate in percent */
export const monthlyRatePercent = (rate: LoanTerms['rate'], places = 4) => format(mul(monthlyRate(rate), fromInt(100)), places)

/** Interest on `balance` for `days` of a 30-day period: B·((1+i)^(d/30) − 1) */
export function proRataInterest(balance: number, i: Dec, days: number): number {
  if (days <= 0 || balance <= 0 || i === ZERO) return 0
  if (days === 30) return centavosTimes(balance, i)
  const factor = sub(nthRoot(powInt(add(ONE, i), days), 30), ONE)
  return centavosTimes(balance, factor)
}

/** Price payment for `balance` over `n` periods: B·i / (1 − (1+i)^−n) */
export function pricePayment(balance: number, i: Dec, n: number): number {
  if (n <= 0) return balance
  if (i === ZERO) return Math.ceil(balance / n)
  const f = powInt(add(ONE, i), n)
  return centavosTimes(balance, div(mul(i, f), sub(f, ONE)))
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/** Due date of installment n: first due date + (n − 1) months, same day (clamped) */
export function dueDateOf(t: Pick<LoanTerms, 'firstDueDate'>, n: number): string {
  return dayIn(addMonths(parseYM(t.firstDueDate), n - 1), Number(t.firstDueDate.slice(8)))
}

/** Start of the period that ends with installment n */
const periodStart = (t: LoanTerms, n: number) => (n === 1 ? t.startDate : dueDateOf(t, n - 1))

const toUTC = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86_400_000)

// ─── State transitions ──────────────────────────────────────────────────────

export function initialState(t: LoanTerms): LoanState {
  const i = monthlyRate(t.rate)
  return {
    balance: t.principal,
    next: 1,
    remaining: t.termMonths,
    payment: t.system === 'price' ? pricePayment(t.principal, i, t.termMonths) : 0,
    amortization: t.system === 'sac' ? Math.floor(t.principal / t.termMonths) : 0,
    accruedDays: 0,
  }
}

/** The next regular installment from state `s`, and the state after paying it */
export function nextInstallment(t: LoanTerms, s: LoanState): { inst: InstallmentCalc; state: LoanState } {
  if (s.balance <= 0 || s.remaining <= 0) throw new Error('Empréstimo já quitado')
  const i = monthlyRate(t.rate)
  // Interest for what's left of the period (all of it, unless a prepayment already paid part)
  const interest = proRataInterest(s.balance, i, 30 - s.accruedDays)
  let principal: number
  if (s.remaining === 1) principal = s.balance
  else if (t.system === 'price') principal = Math.min(Math.max(s.payment - interest, 0), s.balance)
  else principal = Math.min(s.amortization, s.balance)
  const fees = t.monthlyFees ?? 0
  const balanceAfter = s.balance - principal
  return {
    inst: { n: s.next, dueDate: dueDateOf(t, s.next), interest, principal, fees, total: interest + principal + fees, balanceAfter },
    state: { ...s, balance: balanceAfter, next: s.next + 1, remaining: balanceAfter === 0 ? 0 : s.remaining - 1, accruedDays: 0 },
  }
}

/** Remaining installments if the Price payment is kept (counted, not estimated) */
function priceTermFor(balance: number, i: Dec, payment: number): number {
  let b = balance
  for (let n = 1; n <= MAX_TERM; n++) {
    const interest = centavosTimes(b, i)
    const principal = payment - interest
    if (principal <= 0) throw new Error('A prestação não cobre os juros')
    b -= principal
    if (b <= 0) return n
  }
  return MAX_TERM
}

export interface PrepaymentCalc {
  date: string
  amount: number
  /** Pro-rata interest accrued since the period started, paid first */
  interest: number
  principal: number
  payoff: boolean
  state: LoanState
}

/** Largest amount accepted on `date`: outstanding + accrued interest (quitação) */
export function payoffAmount(t: LoanTerms, s: LoanState, date: string): number {
  return s.balance + accruedInterest(t, s, date).interest
}

function accruedInterest(t: LoanTerms, s: LoanState, date: string): { days: number; interest: number } {
  const start = periodStart(t, s.next)
  const elapsed = Math.min(30, Math.max(0, daysBetween(start, date)))
  const days = Math.max(0, elapsed - s.accruedDays)
  return { days, interest: proRataInterest(s.balance, monthlyRate(t.rate), days) }
}

/** Extra amortization of `amount` on `date` */
export function prepayment(t: LoanTerms, s: LoanState, date: string, amount: number, mode: PrepaymentMode): PrepaymentCalc {
  if (s.balance <= 0) throw new Error('Empréstimo já quitado')
  const i = monthlyRate(t.rate)
  const { days, interest } = accruedInterest(t, s, date)
  const maxAmount = s.balance + interest
  if (amount > maxAmount) throw new Error(`O valor passa do saldo para quitação (${maxAmount} centavos)`)
  const principal = amount - interest
  if (principal <= 0) throw new Error('O valor não cobre nem os juros do período')
  const balance = s.balance - principal
  const accruedDays = s.accruedDays + days

  if (balance === 0) {
    return { date, amount, interest, principal, payoff: true, state: { ...s, balance: 0, remaining: 0, accruedDays } }
  }
  let next: LoanState
  if (mode === 'reduce-term') {
    const remaining = t.system === 'price' ? priceTermFor(balance, i, s.payment) : Math.ceil(balance / s.amortization)
    next = { ...s, balance, remaining: Math.min(remaining, s.remaining), accruedDays }
  } else {
    next = t.system === 'price'
      ? { ...s, balance, payment: pricePayment(balance, i, s.remaining), accruedDays }
      : { ...s, balance, amortization: Math.floor(balance / s.remaining), accruedDays }
  }
  return { date, amount, interest, principal, payoff: false, state: next }
}

/** Align the outstanding balance with the bank's statement; the term is kept */
export function adjustBalance(t: LoanTerms, s: LoanState, balance: number): LoanState {
  if (balance <= 0) return { ...s, balance: 0, remaining: 0 }
  const i = monthlyRate(t.rate)
  return t.system === 'price'
    ? { ...s, balance, payment: pricePayment(balance, i, Math.max(s.remaining, 1)) }
    : { ...s, balance, amortization: Math.floor(balance / Math.max(s.remaining, 1)) }
}

/** Every remaining installment from state `s` until the balance reaches zero */
export function project(t: LoanTerms, s: LoanState): InstallmentCalc[] {
  const out: InstallmentCalc[] = []
  let state = s
  while (state.balance > 0 && state.remaining > 0 && out.length < MAX_TERM) {
    const r = nextInstallment(t, state)
    out.push(r.inst)
    state = r.state
  }
  return out
}

/** The original schedule, with no events at all */
export const originalSchedule = (t: LoanTerms) => project(t, initialState(t))
