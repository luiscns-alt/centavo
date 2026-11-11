import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/db'
import { buildCardInsights, type CardInsights } from './cardInsights'
import { todayISO } from '../../shared/utils/dates'

/**
 * One read for the whole Cartões section, independent of the chart above (each section has its
 * own live query, so neither waits for the other). Local IndexedDB: milliseconds, no network.
 * undefined = loading · null = no card in scope (section hidden).
 */
export function useCardInsights(
  endYear: number, endMonth: number, n: number, scopeIds: number[] | null,
): CardInsights | null | undefined {
  const idsKey = scopeIds?.join(',') ?? '*'
  return useLiveQuery(async () => {
    const accounts = await db.accounts.toArray()
    const cardIds = accounts.filter(a => a.kind === 'credit').map(a => a.id as number)
    if (cardIds.length === 0) return null // cheapest path for users without cards
    const [transactions, payments] = await Promise.all([
      db.transactions.where('type').equals('expense').toArray(),
      db.transfers.where('toAccountId').anyOf(cardIds).toArray(),
    ])
    return buildCardInsights({ accounts, transactions, payments, scopeIds, endYear, endMonth, n, today: todayISO() })
  }, [endYear, endMonth, n, idsKey])
}
