import { useLiveQuery } from 'dexie-react-hooks'
import { db, monthBounds, type Category, type Transaction } from '../db'

export interface TransactionRow {
  tx: Transaction
  category: Category
}

export function useTransactionList(year: number, month: number): { rows: TransactionRow[]; loading: boolean } {
  const { start, end } = monthBounds(year, month)

  const result = useLiveQuery(async () => {
    const [transactions, categories] = await Promise.all([
      db.transactions.where('date').between(start, end, true, true).toArray(),
      db.categories.toArray(),
    ])

    const catMap = new Map<number, Category>(
      categories.filter(c => c.id != null).map(c => [c.id as number, c])
    )

    return transactions
      .map(tx => {
        const category = catMap.get(tx.categoryId)
        if (!category) return null
        return { tx, category }
      })
      .filter((r): r is TransactionRow => r !== null)
      .sort((a, b) => (a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : b.tx.createdAt - a.tx.createdAt))
  }, [start, end])

  if (!result) return { rows: [], loading: true }
  return { rows: result, loading: false }
}
