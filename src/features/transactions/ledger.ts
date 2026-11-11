/**
 * Write path — Income, expense, transfers and refunds.
 *
 * Every function validates *inside* the same read-write IndexedDB transaction that writes, so a
 * check can't go stale between reading and writing, and any error rolls the whole operation back.
 * Balances are never stored (see features/accounts/balances.ts).
 */
import { db as defaultDb, formatBRL, type CentavoDB, type PaymentMethod, type Transaction, type Transfer } from '../../core/db'
import { LedgerError, cleanDescription, isISODate, isMethod, isPositiveCentavos, openAccount, openCard, refundedOf, type RefundTarget } from '../../core/ledger/base'
import { invoiceFor } from '../credit-cards'

// ─── Income / expense (non-card accounts) ───────────────────────────────────

export interface TransactionInput {
  type: 'income' | 'expense'
  amount: number
  categoryId: number
  accountId: number
  method?: PaymentMethod
  description?: string
  date: string
}

async function validTransaction(database: CentavoDB, input: TransactionInput) {
  if (input.type !== 'income' && input.type !== 'expense') throw new LedgerError('Tipo inválido.')
  if (!isPositiveCentavos(input.amount)) throw new LedgerError('Informe um valor maior que zero.')
  if (!isISODate(input.date)) throw new LedgerError('Data inválida.')
  if (input.method !== undefined && !isMethod(input.method)) throw new LedgerError('Forma de pagamento inválida.')
  if (input.method === 'credit') throw new LedgerError('Compras no crédito são lançadas no cartão.')
  const cat = Number.isInteger(input.categoryId) ? await database.categories.get(input.categoryId) : undefined
  if (!cat) throw new LedgerError('Categoria não encontrada.')
  if (cat.type !== input.type) throw new LedgerError('A categoria não combina com o tipo do lançamento.')
  const acc = await openAccount(database, input.accountId)
  if (acc.kind === 'credit') throw new LedgerError('Use "compra no cartão" para lançar no cartão de crédito.')
  if (acc.kind === 'loan') throw new LedgerError('Parcelas de empréstimo são pagas pela tela do empréstimo.')

  const tx: Omit<Transaction, 'id' | 'createdAt'> = {
    type: input.type,
    amount: input.amount,
    categoryId: input.categoryId,
    accountId: input.accountId,
    date: input.date,
    month: input.date.slice(0, 7),
  }
  if (input.method) tx.method = input.method
  const description = cleanDescription(input.description)
  if (description) tx.description = description
  return tx
}

export async function addTransaction(input: TransactionInput, database: CentavoDB = defaultDb): Promise<number> {
  return database.transaction('rw', database.transactions, database.categories, database.accounts, async () => {
    const tx = await validTransaction(database, input)
    return database.transactions.add({ ...tx, createdAt: Date.now() } as Transaction) as Promise<number>
  })
}

/** Edit an income/expense. Card installments are edited through their purchase instead. */
export async function updateTransaction(id: number, input: TransactionInput, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.transactions, database.categories, database.accounts, async () => {
    const current = await database.transactions.get(id)
    if (!current) throw new LedgerError('Lançamento não encontrado.')
    if (current.purchaseId !== undefined) throw new LedgerError('Esta é uma parcela de cartão — edite a compra.')
    if (current.loanEventId !== undefined) throw new LedgerError('Este lançamento é de um empréstimo — ajuste pelo empréstimo.')
    if (current.type === 'refund') throw new LedgerError('Estornos não são editados — exclua e lance de novo.')
    const refunded = await refundedOf(database, { kind: 'tx', id })
    if (refunded > 0 && (input.type !== 'expense' || input.amount < refunded || input.accountId !== current.accountId)) {
      throw new LedgerError('Este lançamento tem estornos — o valor não pode ficar abaixo do estornado, nem mudar de tipo ou conta.')
    }
    const tx = await validTransaction(database, input)
    await database.transactions.put({ ...tx, id, createdAt: current.createdAt, updatedAt: Date.now() } as Transaction)
  })
}

export async function deleteTransaction(id: number, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.transactions, async () => {
    const current = await database.transactions.get(id)
    if (!current) throw new LedgerError('Lançamento não encontrado.')
    if (current.purchaseId !== undefined) throw new LedgerError('Esta é uma parcela de cartão — exclua a compra.')
    if (current.loanEventId !== undefined) throw new LedgerError('Este lançamento é de um empréstimo — desfaça pelo empréstimo.')
    if ((await refundedOf(database, { kind: 'tx', id })) > 0) throw new LedgerError('Este lançamento tem estornos — exclua os estornos antes.')
    await database.transactions.delete(id)
  })
}

// ─── Transfers ───────────────────────────────────────────────────────────────

export interface TransferInput {
  fromAccountId: number
  toAccountId: number
  amount: number
  date: string
  description?: string
  /** Only when paying a card: the invoice (YYYY-MM) this payment settles */
  invoiceMonth?: string
}

async function validTransfer(database: CentavoDB, input: TransferInput) {
  if (!isPositiveCentavos(input.amount)) throw new LedgerError('Informe um valor maior que zero.')
  if (!isISODate(input.date)) throw new LedgerError('Data inválida.')
  if (input.fromAccountId === input.toAccountId) throw new LedgerError('Escolha contas diferentes de origem e destino.')
  const from = await openAccount(database, input.fromAccountId, 'Conta de origem')
  const to = await openAccount(database, input.toAccountId, 'Conta de destino')
  if (from.kind === 'credit') throw new LedgerError('Dinheiro não sai de um cartão por transferência.')
  if (from.kind === 'loan' || to.kind === 'loan') throw new LedgerError('Movimentos de empréstimo são feitos pela tela do empréstimo.')
  if (input.invoiceMonth !== undefined) {
    if (to.kind !== 'credit') throw new LedgerError('Só pagamentos de cartão têm fatura.')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.invoiceMonth)) throw new LedgerError('Fatura inválida.')
  }
  const t: Omit<Transfer, 'id' | 'createdAt'> = {
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: input.amount,
    date: input.date,
  }
  if (input.invoiceMonth) t.invoiceMonth = input.invoiceMonth
  const description = cleanDescription(input.description)
  if (description) t.description = description
  return t
}

/** One row, one write: there is no state in which A was debited and B not credited */
export async function createTransfer(input: TransferInput, database: CentavoDB = defaultDb): Promise<number> {
  return database.transaction('rw', database.transfers, database.accounts, async () => {
    const t = await validTransfer(database, input)
    return database.transfers.add({ ...t, createdAt: Date.now() } as Transfer) as Promise<number>
  })
}

export async function updateTransfer(id: number, input: TransferInput, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.transfers, database.accounts, async () => {
    const current = await database.transfers.get(id)
    if (!current) throw new LedgerError('Transferência não encontrada.')
    if (current.loanId !== undefined) throw new LedgerError('Esta é a liberação de um empréstimo — não pode ser editada.')
    const t = await validTransfer(database, input)
    // put (not update) so a removed description doesn't linger
    await database.transfers.put({ ...t, id, createdAt: current.createdAt, updatedAt: Date.now() } as Transfer)
  })
}

export async function deleteTransfer(id: number, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.transfers, async () => {
    const current = await database.transfers.get(id)
    if (!current) throw new LedgerError('Transferência não encontrada.')
    if (current.loanId !== undefined) throw new LedgerError('Esta é a liberação de um empréstimo — exclua o empréstimo.')
    await database.transfers.delete(id)
  })
}

// ─── Refunds (estornos / reembolsos) ─────────────────────────────────────────

export interface RefundInput {
  of: RefundTarget
  amount: number
  date: string
  description?: string
}

/**
 * Money back for an expense, in its category: it raises the account balance and lowers the
 * category's spending in the refund's month — never income. On a card it is a credit on the
 * invoice open at the refund date. The sum of refunds never exceeds the original.
 */
export async function createRefund(input: RefundInput, database: CentavoDB = defaultDb): Promise<number> {
  return database.transaction('rw', [database.transactions, database.purchases, database.accounts, database.categories], async () => {
    if (!isPositiveCentavos(input.amount)) throw new LedgerError('Informe o valor do estorno.')
    if (!isISODate(input.date)) throw new LedgerError('Data inválida.')
    const already = await refundedOf(database, input.of)
    const description = cleanDescription(input.description)

    if (input.of.kind === 'purchase') {
      const purchase = await database.purchases.get(input.of.id)
      if (!purchase) throw new LedgerError('Compra não encontrada.')
      if (input.date < purchase.date) throw new LedgerError('O estorno não pode ser anterior à compra.')
      if (already + input.amount > purchase.total) throw new LedgerError(`Dá para estornar no máximo ${formatBRL(purchase.total - already)}.`)
      const card = await openCard(database, purchase.accountId)
      const invoiceMonth = invoiceFor(input.date, card.card.closingDay, card.card.dueDay).invoiceMonth
      const row: Transaction = {
        type: 'refund', amount: input.amount, categoryId: purchase.categoryId, accountId: purchase.accountId,
        date: input.date, month: invoiceMonth, invoiceMonth, method: 'credit', refundOfPurchase: purchase.id!,
        createdAt: Date.now(),
      }
      row.description = description ?? `Estorno · ${purchase.description ?? 'compra'}`
      return database.transactions.add(row) as Promise<number>
    }

    const original = await database.transactions.get(input.of.id)
    if (!original || original.type !== 'expense') throw new LedgerError('Só despesas podem ser estornadas.')
    if (original.loanEventId !== undefined) throw new LedgerError('Parcelas de empréstimo não são estornadas — desfaça pelo empréstimo.')
    if (original.purchaseId !== undefined) throw new LedgerError('Estorne pela compra no cartão.')
    if (input.date < original.date) throw new LedgerError('O estorno não pode ser anterior à despesa.')
    if (already + input.amount > original.amount) throw new LedgerError(`Dá para estornar no máximo ${formatBRL(original.amount - already)}.`)
    await openAccount(database, original.accountId)
    const row: Transaction = {
      type: 'refund', amount: input.amount, categoryId: original.categoryId, accountId: original.accountId,
      date: input.date, month: input.date.slice(0, 7), refundOf: original.id!, createdAt: Date.now(),
    }
    if (original.method) row.method = original.method
    row.description = description ?? `Estorno · ${original.description ?? 'despesa'}`
    return database.transactions.add(row) as Promise<number>
  })
}
