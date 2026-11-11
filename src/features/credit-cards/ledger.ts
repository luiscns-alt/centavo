/**
 * Write path — Card purchases (installments) and invoice payments.
 *
 * Every function validates *inside* the same read-write IndexedDB transaction that writes, so a
 * check can't go stale between reading and writing, and any error rolls the whole operation back.
 * Balances are never stored (see features/accounts/balances.ts).
 */
import { db as defaultDb, type CentavoDB, type Purchase, type Transaction } from '../../core/db'
import { LedgerError, MAX_INSTALLMENTS, cleanDescription, isISODate, isPositiveCentavos, openCard, refundedOf } from '../../core/ledger/base'
import { addMonthsKey, invoiceFor, splitInstallments } from './invoice'
import { createTransfer } from '../transactions'

// ─── Credit-card purchases ───────────────────────────────────────────────────

export interface CardPurchaseInput {
  accountId: number     // the card
  categoryId: number
  description?: string
  date: string
  total: number
  installments: number
}

export interface InstallmentInfo {
  transactionId: number
  number: number
  amount: number
  invoiceMonth: string
}

async function validPurchase(database: CentavoDB, input: CardPurchaseInput) {
  if (!isPositiveCentavos(input.total)) throw new LedgerError('Informe um valor maior que zero.')
  if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > MAX_INSTALLMENTS) {
    throw new LedgerError(`Parcelas: de 1 a ${MAX_INSTALLMENTS}.`)
  }
  if (input.total < input.installments) throw new LedgerError('Cada parcela precisa ter pelo menos R$ 0,01.')
  if (!isISODate(input.date)) throw new LedgerError('Data inválida.')
  const cat = Number.isInteger(input.categoryId) ? await database.categories.get(input.categoryId) : undefined
  if (!cat || cat.type !== 'expense') throw new LedgerError('Escolha uma categoria de despesa.')
  const card = await openCard(database, input.accountId)
  const first = invoiceFor(input.date, card.card.closingDay, card.card.dueDay).invoiceMonth
  const description = cleanDescription(input.description)
  return { card, first, description }
}

/** Write the N installment rows of a purchase (inside the caller's transaction) */
async function writeInstallments(database: CentavoDB, purchase: Purchase & { id: number }): Promise<InstallmentInfo[]> {
  const amounts = splitInstallments(purchase.total, purchase.installments)
  const rows: Transaction[] = amounts.map((amount, i) => {
    const invoiceMonth = addMonthsKey(purchase.firstInvoice, i)
    const row: Transaction = {
      type: 'expense',
      amount,
      categoryId: purchase.categoryId,
      accountId: purchase.accountId,
      date: purchase.date,
      month: invoiceMonth,
      method: 'credit',
      purchaseId: purchase.id,
      installment: i + 1,
      installments: purchase.installments,
      invoiceMonth,
      createdAt: purchase.createdAt,
    }
    if (purchase.description) row.description = purchase.description
    return row
  })
  const ids = await database.transactions.bulkAdd(rows, { allKeys: true }) as number[]
  return rows.map((r, i) => ({ transactionId: ids[i], number: r.installment!, amount: r.amount, invoiceMonth: r.invoiceMonth! }))
}

const PURCHASE_TABLES = (d: CentavoDB) => [d.purchases, d.transactions, d.accounts, d.categories]

/**
 * A card purchase in 1..N installments: one Purchase + N expense rows, all in one
 * IndexedDB transaction — either everything is written or nothing is.
 */
export async function createCardPurchase(
  input: CardPurchaseInput, database: CentavoDB = defaultDb,
): Promise<{ purchaseId: number; installments: InstallmentInfo[] }> {
  return database.transaction('rw', PURCHASE_TABLES(database), async () => {
    const { first, description } = await validPurchase(database, input)
    const purchase: Purchase = {
      accountId: input.accountId, categoryId: input.categoryId, total: input.total,
      installments: input.installments, date: input.date, firstInvoice: first, createdAt: Date.now(),
    }
    if (description) purchase.description = description
    const purchaseId = await database.purchases.add(purchase) as number
    const installments = await writeInstallments(database, { ...purchase, id: purchaseId })
    return { purchaseId, installments }
  })
}

/** Edit a purchase: its installments are deleted and regenerated in the same transaction */
export async function updateCardPurchase(
  id: number, input: CardPurchaseInput, database: CentavoDB = defaultDb,
): Promise<InstallmentInfo[]> {
  return database.transaction('rw', PURCHASE_TABLES(database), async () => {
    const current = await database.purchases.get(id)
    if (!current) throw new LedgerError('Compra não encontrada.')
    const refunded = await refundedOf(database, { kind: 'purchase', id })
    if (refunded > 0 && (input.total < refunded || input.accountId !== current.accountId)) {
      throw new LedgerError('Esta compra tem estornos — o total não pode ficar abaixo do estornado, nem mudar de cartão.')
    }
    const { first, description } = await validPurchase(database, input)
    const next: Purchase = {
      id, accountId: input.accountId, categoryId: input.categoryId, total: input.total,
      installments: input.installments, date: input.date, firstInvoice: first,
      createdAt: current.createdAt, updatedAt: Date.now(),
    }
    if (description) next.description = description
    await database.transactions.where('purchaseId').equals(id).delete()
    await database.purchases.put(next)
    return writeInstallments(database, next as Purchase & { id: number })
  })
}

export async function deleteCardPurchase(id: number, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.purchases, database.transactions, async () => {
    if (!(await database.purchases.get(id))) throw new LedgerError('Compra não encontrada.')
    if ((await refundedOf(database, { kind: 'purchase', id })) > 0) throw new LedgerError('Esta compra tem estornos — exclua os estornos antes.')
    await database.transactions.where('purchaseId').equals(id).delete()
    await database.purchases.delete(id)
  })
}

// ─── Invoice payment ─────────────────────────────────────────────────────────

export interface InvoicePaymentInput {
  cardAccountId: number
  invoiceMonth: string
  fromAccountId: number
  amount: number
  date: string
  description?: string
}

/**
 * "Pagar fatura": one transfer from a bank account to the card, tagged with the invoice.
 * Money leaves the bank, the card's debt drops, and nothing is counted as an expense again —
 * the purchases already were.
 */
export async function payInvoice(input: InvoicePaymentInput, database: CentavoDB = defaultDb): Promise<number> {
  return database.transaction('rw', database.transfers, database.accounts, async () => {
    await openCard(database, input.cardAccountId)
    return createTransfer({
      fromAccountId: input.fromAccountId,
      toAccountId: input.cardAccountId,
      amount: input.amount,
      date: input.date,
      description: input.description,
      invoiceMonth: input.invoiceMonth,
    }, database)
  })
}
