import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO, type Account } from '../../core/db'
import { buildLoanSchedule, type LoanSchedule, type ScheduleRow } from './loanSchedule'

export { buildLoanSchedule, type InstallmentStatus, type LoanSchedule, type ScheduleRow } from './loanSchedule'

export function useLoanSchedule(loanId: number | null): LoanSchedule | null | undefined {
  return useLiveQuery(async () => {
    if (loanId === null) return null
    const loan = await db.loans.get(loanId)
    if (!loan) return null
    const [account, events] = await Promise.all([
      db.accounts.get(loan.accountId),
      db.loanEvents.where('loanId').equals(loanId).toArray(),
    ])
    if (!account || events.length === 0) return null
    return buildLoanSchedule(loan, account, events, todayISO())
  }, [loanId])
}

export interface LoanSummary {
  loanId: number
  account: Account
  outstanding: number
  next?: ScheduleRow
  paid: number
  total: number
}

/** One line per loan for the Contas card */
export function useLoanSummaries(): LoanSummary[] | undefined {
  return useLiveQuery(async () => {
    const [loans, events, accounts] = await Promise.all([db.loans.toArray(), db.loanEvents.toArray(), db.accounts.toArray()])
    const today = todayISO()
    return loans.flatMap(loan => {
      const account = accounts.find(a => a.id === loan.accountId)
      const evs = events.filter(e => e.loanId === loan.id)
      if (!account || evs.length === 0) return []
      const s = buildLoanSchedule(loan, account, evs, today)
      return [{
        loanId: loan.id as number, account, outstanding: s.summary.outstanding, next: s.summary.next,
        paid: s.summary.paidInstallments, total: s.summary.paidInstallments + s.summary.remainingInstallments,
      }]
    })
  })
}
