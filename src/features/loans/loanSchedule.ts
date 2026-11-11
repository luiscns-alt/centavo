import { loanTerms } from './ledger'
import { dueDateOf, originalSchedule, project, type InstallmentCalc, type LoanTerms } from './loanMath'
import type { Account, Loan, LoanEvent } from '../../core/types'

export type InstallmentStatus = 'paid' | 'due' | 'overdue' | 'projected'

export interface ScheduleRow extends InstallmentCalc {
  status: InstallmentStatus
  paidAt?: string
  eventId?: number
}

/** The amortization table of a loan: paid rows from stored snapshots, the rest projected */
export interface LoanSchedule {
  loan: Loan
  account: Account
  terms: LoanTerms
  events: LoanEvent[]
  last: LoanEvent
  installments: ScheduleRow[]
  summary: {
    outstanding: number
    paidInstallments: number
    remainingInstallments: number
    totalPaid: number
    interestPaid: number
    principalPaid: number
    interestRemaining: number
    next?: ScheduleRow
    endDate?: string
    saved: { interest: number; months: number } | null
  }
}

export function buildLoanSchedule(loan: Loan, account: Account, events: LoanEvent[], today: string): LoanSchedule {
  const terms = loanTerms(loan)
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const last = sorted[sorted.length - 1]

  const paid: ScheduleRow[] = sorted
    .filter(e => e.kind === 'payment')
    .map(e => ({
      n: e.installment!, dueDate: '', interest: e.interest, principal: e.principal, fees: e.fees,
      total: e.amount, balanceAfter: e.state.balance, status: 'paid' as const, paidAt: e.date, eventId: e.id,
    }))
  // Due date of a paid installment is the contract's, not the payment day
  for (const r of paid) r.dueDate = dueDateOf(terms, r.n)

  const projected: ScheduleRow[] = project(terms, last.state).map((r, k) => ({
    ...r,
    status: r.dueDate < today ? 'overdue' : k === 0 ? 'due' : 'projected',
  }))

  const moneyEvents = sorted.filter(e => e.kind === 'payment' || e.kind === 'prepayment')
  const interestPaid = moneyEvents.reduce((s, e) => s + e.interest, 0)
  const interestRemaining = projected.reduce((s, r) => s + r.interest, 0)
  const hasPrepayments = sorted.some(e => e.kind === 'prepayment')
  const baseline = hasPrepayments ? originalSchedule(terms) : null
  const baselineInterest = baseline?.reduce((s, r) => s + r.interest, 0) ?? 0

  return {
    loan, account, terms, events: sorted, last,
    installments: [...paid, ...projected],
    summary: {
      outstanding: last.state.balance,
      paidInstallments: paid.length,
      remainingInstallments: projected.length,
      totalPaid: moneyEvents.reduce((s, e) => s + e.amount, 0),
      interestPaid,
      principalPaid: sorted.reduce((s, e) => s + (e.kind === 'release' ? 0 : e.principal), 0),
      interestRemaining,
      next: projected[0],
      endDate: projected[projected.length - 1]?.dueDate ?? paid[paid.length - 1]?.dueDate,
      saved: baseline
        ? { interest: Math.max(0, baselineInterest - interestPaid - interestRemaining), months: Math.max(0, baseline.length - paid.length - projected.length) }
        : null,
    },
  }
}
