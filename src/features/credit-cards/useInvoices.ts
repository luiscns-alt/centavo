import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO, type Account, type CardSettings, type Category, type Purchase, type Transaction, type Transfer } from '../../core/db'
import { buildCardInvoices, type CardInvoice } from './cardInvoices'

export interface Invoice extends Omit<CardInvoice, 'items'> {
  items: { tx: Transaction; purchase?: Purchase; category?: Category }[]
}

export interface CardData {
  card: Account
  bank?: Account
  currentInvoice: string
  invoices: Invoice[]
  /** Total owed, future installments included */
  debt: number
  available: number | null
}

/** Everything the card screen shows, derived from installments and payments — nothing is stored */
export function useCardData(cardId: number | null): CardData | null | undefined {
  return useLiveQuery(async () => {
    if (cardId === null) return null
    const card = await db.accounts.get(cardId)
    if (!card?.card) return null
    const [txs, payments, purchases, categories, bank] = await Promise.all([
      db.transactions.where('accountId').equals(cardId).toArray(),
      db.transfers.where('toAccountId').equals(cardId).toArray(),
      db.purchases.where('accountId').equals(cardId).toArray(),
      db.categories.toArray(),
      db.accounts.get(card.card.bankAccountId),
    ])
    const ledger = buildCardInvoices(card as Account & { card: CardSettings }, txs, payments, todayISO())
    const purchaseById = new Map(purchases.map(p => [p.id as number, p]))
    const catById = new Map(categories.map(c => [c.id as number, c]))
    return {
      card,
      bank,
      currentInvoice: ledger.currentInvoice,
      debt: ledger.debt,
      available: ledger.available,
      invoices: ledger.invoices.map(inv => ({
        ...inv,
        items: inv.items.map(tx => ({
          tx, purchase: tx.purchaseId ? purchaseById.get(tx.purchaseId) : undefined, category: catById.get(tx.categoryId),
        })),
      })),
    }
  }, [cardId])
}

export interface CardSummary {
  invoiceMonth: string
  dueDate: string
  /** What is still owed on the invoice to pay now */
  remaining: number
  available: number | null
}

/** Invoice-to-pay summary for every card — one read for all cards (Contas card, form limit warning) */
export function useCardSummaries(): Map<number, CardSummary> | undefined {
  return useLiveQuery(async () => {
    const cards = (await db.accounts.toArray()).filter((a): a is Account & { card: CardSettings } => a.kind === 'credit' && !!a.card)
    const ids = cards.map(c => c.id as number)
    const [txs, pays] = await Promise.all([
      db.transactions.where('accountId').anyOf(ids).toArray(),
      db.transfers.where('toAccountId').anyOf(ids).toArray(),
    ])
    const today = todayISO()
    const out = new Map<number, CardSummary>()
    for (const card of cards) {
      const id = card.id as number
      const l = buildCardInvoices(card, txs.filter(t => t.accountId === id), pays.filter((t: Transfer) => t.toAccountId === id), today)
      out.set(id, { invoiceMonth: l.dueInvoice.invoiceMonth, dueDate: l.dueInvoice.dueDate, remaining: l.dueInvoice.remaining, available: l.available })
    }
    return out
  })
}
