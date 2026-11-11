import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO } from '../../core/db'
import { buildBudgetDashboard, type BudgetDashboard, type ForecastItem } from './budgets'
import { buildLoanSchedule } from '../loans'

/**
 * Budget dashboard for a month — always global (budgets are per category, not per account).
 * Reads only the month's transactions, booked card installments ahead and, for the current or a
 * future month, the loans' unpaid installments due in it.
 */
export function useBudgetDashboard(year: number, month: number): BudgetDashboard | undefined {
  return useLiveQuery(() => loadBudgetDashboard(year, month), [year, month])
}

/** Same read, outside React (for liveQuery subscriptions) */
export async function loadBudgetDashboard(year: number, month: number): Promise<BudgetDashboard> {
  const key = `${year}-${String(month).padStart(2, '0')}`
  const today = todayISO()
  const withForecast = key >= today.slice(0, 7)
  const [categories, plans, overrides, transactions, future, loans, events, accounts] = await Promise.all([
    db.categories.where('type').equals('expense').toArray(),
    db.budgets.toArray(),
    db.budgetOverrides.toArray(),
    db.transactions.where('month').equals(key).toArray(),
    db.transactions.where('month').above(key).filter(t => t.purchaseId != null && t.type === 'expense').toArray(),
    withForecast ? db.loans.toArray() : Promise.resolve([]),
    withForecast ? db.loanEvents.toArray() : Promise.resolve([]),
    withForecast ? db.accounts.toArray() : Promise.resolve([]),
  ])
  const forecast: ForecastItem[] = []
  for (const loan of loans) {
    const account = accounts.find(a => a.id === loan.accountId)
    const evs = events.filter(e => e.loanId === loan.id)
    if (!account || evs.length === 0) continue
    const s = buildLoanSchedule(loan, account, evs, today)
    for (const r of s.installments) {
      if (r.status === 'paid' || r.dueDate.slice(0, 7) !== key) continue
      forecast.push({ categoryId: loan.principalCategoryId, amount: r.principal + r.fees })
      forecast.push({ categoryId: loan.interestCategoryId, amount: r.interest })
    }
  }
  return buildBudgetDashboard({ month: key, categories, plans, overrides, transactions, future, forecast, today })
}

