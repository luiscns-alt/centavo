import { useLiveQuery } from 'dexie-react-hooks'
import { db, monthBounds, type Category } from '../db'

export interface CategorySummary {
  category: Category
  total: number // integer centavos
  type: 'income' | 'expense'
}

export interface MonthlyData {
  totalIncome: number   // integer centavos
  totalExpense: number  // integer centavos
  freeBalance: number   // totalIncome - totalExpense
  byCategory: CategorySummary[]
  loading: boolean
}

export function useMonthlyData(year: number, month: number): MonthlyData {
  const { start, end } = monthBounds(year, month)

  const result = useLiveQuery(async () => {
    const [transactions, categories] = await Promise.all([
      db.transactions.where('date').between(start, end, true, true).toArray(),
      db.categories.toArray(),
    ])

    const catMap = new Map<number, Category>(
      categories.filter(c => c.id != null).map(c => [c.id as number, c])
    )

    let totalIncome = 0
    let totalExpense = 0
    const totals = new Map<number, number>()

    for (const tx of transactions) {
      if (tx.type === 'income') totalIncome += tx.amount
      else totalExpense += tx.amount

      totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amount)
    }

    const byCategory: CategorySummary[] = Array.from(totals.entries())
      .map(([catId, total]) => {
        const category = catMap.get(catId)
        if (!category) return null
        return { category, total, type: category.type }
      })
      .filter((s): s is CategorySummary => s !== null)
      .sort((a, b) => b.total - a.total)

    return { totalIncome, totalExpense, freeBalance: totalIncome - totalExpense, byCategory }
  }, [start, end])

  if (!result) return { totalIncome: 0, totalExpense: 0, freeBalance: 0, byCategory: [], loading: true }
  return { ...result, loading: false }
}
