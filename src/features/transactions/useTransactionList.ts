import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/db'
import { invoiceDates } from '../credit-cards'
import { signedAmount } from '../../core/amounts'
import type { Account, Category, Transaction, Transfer } from '../../core/types'
import { monthBounds } from '../../shared/utils/dates'

interface RowBase {
  key: string
  /** Day the row is listed under: its date, or the invoice due date for card installments */
  listDate: string
  createdAt: number
}

export type LedgerRow =
  | (RowBase & { kind: 'tx'; tx: Transaction; category: Category; account?: Account; loanId?: number })
  | (RowBase & { kind: 'transfer'; transfer: Transfer; from?: Account; to?: Account })

/** Card installments of the month are listed together, as their invoice */
export interface InvoiceGroupInfo { card: Account; invoiceMonth: string; dueDate: string }

/** Signed effect of a row on the balance being viewed (all accounts, or a set) */
export function rowDelta(row: LedgerRow, accountIds: number[] | null): number {
  if (row.kind === 'tx') return signedAmount(row.tx)
  if (accountIds === null) return 0 // between my own accounts: no change in total
  const fromIn = accountIds.includes(row.transfer.fromAccountId)
  const toIn = accountIds.includes(row.transfer.toAccountId)
  return fromIn === toIn ? 0 : toIn ? row.transfer.amount : -row.transfer.amount
}

/**
 * Income and expenses reported in a month (card installments in their invoice month) plus the
 * month's transfers, newest first — for all accounts or a set of them.
 */
export function useTransactionList(
  year: number, month: number, accountIds: number[] | null = null,
): { rows: LedgerRow[]; invoices: Map<string, InvoiceGroupInfo>; loading: boolean } {
  const { start, end } = monthBounds(year, month)
  const key = start.slice(0, 7)
  const idsKey = accountIds?.join(',') ?? '*'

  const result = useLiveQuery(async () => {
    const ids = accountIds ? new Set(accountIds) : null
    const [transactions, transfers, categories, accounts] = await Promise.all([
      db.transactions.where('month').equals(key).toArray(),
      db.transfers.where('date').between(start, end, true, true).toArray(),
      db.categories.toArray(),
      db.accounts.toArray(),
    ])

    const eventIds = transactions.flatMap(t => (t.loanEventId !== undefined ? [t.loanEventId] : []))
    const loanOfEvent = new Map(
      (eventIds.length ? await db.loanEvents.bulkGet(eventIds) : []).flatMap(e => (e ? [[e.id as number, e.loanId] as const] : [])),
    )
    const catMap = new Map(categories.map(c => [c.id as number, c]))
    const accMap = new Map(accounts.map(a => [a.id as number, a]))
    const rows: LedgerRow[] = []
    const invoices = new Map<string, InvoiceGroupInfo>()

    for (const tx of transactions) {
      if (ids !== null && !ids.has(tx.accountId)) continue
      const category = catMap.get(tx.categoryId)
      if (!category) continue
      const account = accMap.get(tx.accountId)
      let listDate = tx.date
      if (tx.invoiceMonth && account?.card) {
        const { dueDate } = invoiceDates(tx.invoiceMonth, account.card.closingDay, account.card.dueDay)
        listDate = dueDate
        invoices.set(`inv:${account.id}:${tx.invoiceMonth}`, { card: account, invoiceMonth: tx.invoiceMonth, dueDate })
      }
      const loanId = tx.loanEventId !== undefined ? loanOfEvent.get(tx.loanEventId) : undefined
      rows.push({ kind: 'tx', key: `t${tx.id}`, listDate, createdAt: tx.createdAt, tx, category, account, loanId })
    }
    for (const t of transfers) {
      if (ids !== null && !ids.has(t.fromAccountId) && !ids.has(t.toAccountId)) continue
      rows.push({
        kind: 'transfer', key: `x${t.id}`, listDate: t.date, createdAt: t.createdAt,
        transfer: t, from: accMap.get(t.fromAccountId), to: accMap.get(t.toAccountId),
      })
    }

    rows.sort((a, b) => (a.listDate < b.listDate ? 1 : a.listDate > b.listDate ? -1 : b.createdAt - a.createdAt))
    return { rows, invoices }
  }, [key, start, end, idsKey])

  if (!result) return { rows: [], invoices: new Map(), loading: true }
  return { ...result, loading: false }
}

/** Group key of a row: its card invoice, or its day */
export function groupKeyOf(row: LedgerRow): string {
  if (row.kind === 'tx' && row.tx.invoiceMonth) return `inv:${row.tx.accountId}:${row.tx.invoiceMonth}`
  return row.listDate
}
