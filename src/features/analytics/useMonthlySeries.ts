import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, monthBounds } from '../../core/db'
import { balanceAdjustments, loanCredits } from '../accounts'
import { buildMonthlySeries, type MonthPoint } from './series'

/**
 * Monthly income/expense/net and running balance (patrimônio) for the `n` months ending at
 * (endYear, endMonth) — for all accounts, or a set of them (one account, or a bank + its cards).
 */
export function useMonthlySeries(
  endYear: number, endMonth: number, n: number, accountIds: number[] | null = null,
): { points: MonthPoint[]; loading: boolean } {
  const { end } = monthBounds(endYear, endMonth)
  const idsKey = accountIds?.join(',') ?? '*'

  const data = useLiveQuery(async () => {
    const ids = accountIds ? new Set(accountIds) : null
    const endKey = end.slice(0, 7)
    const [transactions, accounts, transfers, loans, loanEvents] = await Promise.all([
      // Balance needs everything dated up to the end; flows need everything reported up to it
      db.transactions.filter(t => t.date <= end || t.month <= endKey).toArray(),
      db.accounts.toArray(),
      ids === null ? Promise.resolve([]) : db.transfers.where('date').belowOrEqual(end).toArray(),
      db.loans.toArray(),
      db.loanEvents.toArray(),
    ])
    return {
      transactions: ids === null ? transactions : transactions.filter(t => ids.has(t.accountId)),
      adjustments: balanceAdjustments(accounts, transfers, accountIds, loanCredits(loans, loanEvents)),
    }
  }, [end, idsKey])

  const points = useMemo(
    () => buildMonthlySeries(data?.transactions ?? [], endYear, endMonth, n, data?.adjustments ?? []),
    [data, endYear, endMonth, n],
  )

  return { points, loading: data === undefined }
}
