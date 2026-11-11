/** Persisted domain entities (loans and their events) — the shapes stored in IndexedDB (see core/db.ts). */
import type { PaymentMethod } from './transaction'

export type AmortizationSystem = 'price' | 'sac'

export type RateUnit = 'monthly' | 'annual'

/** Where the contract stands after the last recorded event — everything the next step needs */
export interface LoanState {
  balance: number            // outstanding principal, centavos
  next: number               // number of the next installment (1-based)
  remaining: number          // installments left
  payment: number            // Price: current fixed payment (interest + principal)
  amortization: number       // SAC: current fixed amortization
  accruedDays: number        // days of the current period whose interest was already paid (prepayments)
}

export type PrepaymentMode = 'reduce-term' | 'reduce-payment'

export type LoanType = 'mortgage' | 'vehicle' | 'personal' | 'payroll' | 'other'

/**
 * A loan or financing contract (v6+). Only the contract and its events are stored; the schedule
 * is projected by loanMath from the last event's state. The loan's account (kind 'loan') holds
 * the debt: its balance is −outstanding principal.
 */
export interface Loan {
  id?: number
  accountId: number
  type: LoanType
  principal: number                       // centavos
  rate: { value: string; unit: RateUnit } // percent as typed ("0,7974")
  termMonths: number
  system: AmortizationSystem
  startDate: string
  firstDueDate: string
  monthlyFees?: number                    // centavos per installment
  /** deposit: money landed in releaseAccountId · direct: paid straight to the seller */
  release: 'deposit' | 'direct'
  releaseAccountId?: number
  payFromAccountId: number
  principalCategoryId: number
  interestCategoryId: number
  method: PaymentMethod
  createdAt: number
}

/**
 * Something that happened to a loan, in strict order (seq). Append-only: only the last one can
 * be undone. Each carries a snapshot of the split and of the state after it, so history never
 * changes when the future is recalculated.
 */
export interface LoanEvent {
  id?: number
  loanId: number
  seq: number
  kind: 'release' | 'payment' | 'prepayment' | 'adjust'
  date: string
  /** Cash moved (release / payment total / prepayment) or the new balance (adjust) */
  amount: number
  installment?: number
  interest: number
  /** Principal amortized by this event (adjust: old − new balance, may be negative) */
  principal: number
  fees: number
  mode?: PrepaymentMode
  state: LoanState
  transactionIds: number[]
  transferId?: number
  createdAt: number
}
