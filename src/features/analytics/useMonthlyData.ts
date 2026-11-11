import { useLiveQuery } from 'dexie-react-hooks'
import { db, expenseDelta, monthBounds, type Category, type PaymentMethod } from '../../core/db'

export interface CategorySummary {
  category: Category
  total: number // integer centavos
  type: 'income' | 'expense'
}

export interface MonthlyData {
  totalIncome: number   // integer centavos
  totalExpense: number  // integer centavos
  freeBalance: number   // totalIncome - totalExpense — transfers never count here
  /** Only with an account filter: transfers crossing into / out of the selected accounts */
  transfersIn: number
  transfersOut: number
  byCategory: CategorySummary[]
  /** Expenses by payment method, largest first ('none' = not informed) */
  byMethod: { method: PaymentMethod | 'none'; total: number }[]
  loading: boolean
}

/**
 * Month summary for all accounts (accountIds null) or a set of them. Income and expenses count
 * in their report month — card installments in their invoice's month.
 */
export function useMonthlyData(year: number, month: number, accountIds: number[] | null = null): MonthlyData {
  const { start, end } = monthBounds(year, month)
  const key = start.slice(0, 7)
  const idsKey = accountIds?.join(',') ?? '*'

  const result = useLiveQuery(async () => {
    const ids = accountIds ? new Set(accountIds) : null
    const [allTx, categories, transfers] = await Promise.all([
      db.transactions.where('month').equals(key).toArray(),
      db.categories.toArray(),
      ids === null ? Promise.resolve([]) : db.transfers.where('date').between(start, end, true, true).toArray(),
    ])
    const transactions = ids === null ? allTx : allTx.filter(t => ids.has(t.accountId))

    const catMap = new Map<number, Category>(
      categories.filter(c => c.id != null).map(c => [c.id as number, c])
    )

    let totalIncome = 0
    let totalExpense = 0
    const totals = new Map<number, number>()
    const methods = new Map<PaymentMethod | 'none', number>()

    for (const tx of transactions) {
      const value = tx.type === 'income' ? tx.amount : expenseDelta(tx) // refunds count negative
      if (tx.type === 'income') totalIncome += value
      else {
        totalExpense += value
        const m = tx.method ?? 'none'
        methods.set(m, (methods.get(m) ?? 0) + value)
      }
      totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + value)
    }

    let transfersIn = 0
    let transfersOut = 0
    if (ids) {
      for (const t of transfers) {
        const fromIn = ids.has(t.fromAccountId)
        const toIn = ids.has(t.toAccountId)
        if (toIn && !fromIn) transfersIn += t.amount
        if (fromIn && !toIn) transfersOut += t.amount
      }
    }

    const byCategory: CategorySummary[] = Array.from(totals.entries())
      .map(([catId, total]) => {
        const category = catMap.get(catId)
        if (!category) return null
        return { category, total, type: category.type }
      })
      .filter((s): s is CategorySummary => s !== null && s.total > 0)
      .sort((a, b) => b.total - a.total)

    const byMethod = [...methods.entries()].map(([method, total]) => ({ method, total })).filter(m => m.total > 0).sort((a, b) => b.total - a.total)

    return {
      totalIncome, totalExpense, freeBalance: totalIncome - totalExpense,
      transfersIn, transfersOut, byCategory, byMethod,
    }
  }, [key, start, end, idsKey])

  if (!result) {
    return { totalIncome: 0, totalExpense: 0, freeBalance: 0, transfersIn: 0, transfersOut: 0, byCategory: [], byMethod: [], loading: true }
  }
  return { ...result, loading: false }
}
