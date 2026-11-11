import { db as defaultDb, MIGRATED_ACCOUNT_NAME, type Account, type BudgetOverride, type BudgetPlan, type CardSettings, type CentavoDB, type Category, type Loan, type LoanEvent, type PaymentMethod, type Purchase, type Transaction, type Transfer } from '../../core/db'
import { LOAN_TYPES, loanTerms, adjustBalance, initialState, nextInstallment, prepayment, type LoanState } from '../loans'
import { dec } from '../../core/decimal'
import { ACCOUNT_KINDS, PAYMENT_METHODS, isISODate } from '../../core/ledger/base'
import { bankById } from '../accounts'
import { addMonthsKey, splitInstallments } from '../credit-cards'

/**
 * v1: categories + transactions.
 * v2: + accounts, transfers, transactions.accountId.
 * v3: + purchases (card installments), credit-card accounts, transactions.month/method/installments,
 *     transfers.invoiceMonth.
 * v4: + loans, loanEvents, transactions.loanEventId, transfers.loanId.
 * v5: + categories.parentId, budgets, budgetOverrides, refunds (type 'refund', refundOf/refundOfPurchase).
 */
export const BACKUP_FORMAT_VERSION = 5

export interface Backup {
  app: 'centavo'
  version: number
  exportedAt: string // ISO timestamp
  categories: Category[]
  transactions: Transaction[]
  accounts: Account[]
  transfers: Transfer[]
  purchases: Purchase[]
  loans: Loan[]
  loanEvents: LoanEvent[]
  budgets: BudgetPlan[]
  budgetOverrides: BudgetOverride[]
}

/** Error with a message meant to be shown to the user as-is */
export class BackupError extends Error {}

export async function createBackup(db: CentavoDB = defaultDb): Promise<Backup> {
  // One read transaction so every table is from the same consistent snapshot
  return db.transaction('r', [db.categories, db.transactions, db.accounts, db.transfers, db.purchases, db.loans, db.loanEvents, db.budgets, db.budgetOverrides], async () => ({
    app: 'centavo' as const,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
    accounts: await db.accounts.toArray(),
    transfers: await db.transfers.toArray(),
    purchases: await db.purchases.toArray(),
    loans: await db.loans.toArray(),
    loanEvents: await db.loanEvents.toArray(),
    budgets: await db.budgets.toArray(),
    budgetOverrides: await db.budgetOverrides.toArray(),
  }))
}

export function backupFilename(date: string): string {
  return `centavo-backup-${date}.json`
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const isType = (v: unknown): v is 'income' | 'expense' => v === 'income' || v === 'expense'
const isTxType = (v: unknown): v is 'income' | 'expense' | 'refund' => v === 'income' || v === 'expense' || v === 'refund'
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
const isDay = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31
const isOptStr = (v: unknown) => v === undefined || typeof v === 'string'

/**
 * Parse and validate a backup file's text. Throws BackupError with a pt-BR
 * message on anything malformed, so a bad file never reaches the database.
 * Older formats are upgraded the same way the database upgrades itself.
 */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('O arquivo não é um backup válido do Centavo.')
  }

  if (!isObject(data) || data.app !== 'centavo') {
    throw new BackupError('O arquivo não é um backup válido do Centavo.')
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_FORMAT_VERSION) {
    throw new BackupError('Este backup foi feito por uma versão mais nova do Centavo. Atualize o app e tente de novo.')
  }
  if (!Array.isArray(data.categories) || !Array.isArray(data.transactions)) {
    throw new BackupError('O backup está incompleto.')
  }
  const v = data.version
  if (v >= 2 && (!Array.isArray(data.accounts) || !Array.isArray(data.transfers))) {
    throw new BackupError('O backup está incompleto.')
  }
  if (v >= 3 && !Array.isArray(data.purchases)) throw new BackupError('O backup está incompleto.')
  if (v >= 4 && (!Array.isArray(data.loans) || !Array.isArray(data.loanEvents))) throw new BackupError('O backup está incompleto.')
  if (v >= 5 && (!Array.isArray(data.budgets) || !Array.isArray(data.budgetOverrides))) throw new BackupError('O backup está incompleto.')

  // ── Categories
  const categories: Category[] = data.categories.map((c, i) => {
    if (!isObject(c) || !isId(c.id) || typeof c.name !== 'string' || !isType(c.type) || typeof c.icon !== 'string') {
      throw new BackupError(`Categoria ${i + 1} do backup está corrompida.`)
    }
    const cat: Category = { id: c.id, name: c.name, type: c.type, icon: c.icon }
    if (c.parentId !== undefined) {
      if (!isId(c.parentId)) throw new BackupError(`Categoria ${i + 1} do backup está corrompida.`)
      cat.parentId = c.parentId
    }
    return cat
  })
  const categoryById = new Map(categories.map(c => [c.id as number, c]))
  for (const c of categories) {
    if (c.parentId === undefined) continue
    const parent = categoryById.get(c.parentId)
    if (!parent || parent.parentId !== undefined || parent.type !== c.type || parent.id === c.id) {
      throw new BackupError(`A categoria "${c.name}" do backup tem uma categoria principal inválida.`)
    }
  }

  // ── Accounts (v2+). A v1 backup has none: its transactions adopt one migrated account.
  const accounts: Account[] = v < 2
    ? (data.transactions.length > 0
      ? [{ id: 1, name: MIGRATED_ACCOUNT_NAME, kind: 'checking', icon: '🏦', openingBalance: 0, openingDate: '1970-01-01', archived: 0, createdAt: 0 }]
      : [])
    : (data.accounts as unknown[]).map((a, i) => {
      if (
        !isObject(a) || !isId(a.id) || typeof a.name !== 'string' || !a.name.trim() ||
        typeof a.kind !== 'string' || !(a.kind in ACCOUNT_KINDS) || typeof a.icon !== 'string' ||
        !Number.isSafeInteger(a.openingBalance) || !isISODate(a.openingDate) ||
        (a.archived !== 0 && a.archived !== 1) || typeof a.createdAt !== 'number'
      ) {
        throw new BackupError(`Conta ${i + 1} do backup está corrompida.`)
      }
      const account: Account = {
        id: a.id, name: a.name, kind: a.kind as Account['kind'], icon: a.icon,
        openingBalance: a.openingBalance as number, openingDate: a.openingDate, archived: a.archived, createdAt: a.createdAt,
      }
      // A bank this version doesn't know (e.g. from a newer app) just falls back to the emoji
      if (typeof a.bankId === 'string' && bankById(a.bankId)) account.bankId = a.bankId
      if (account.kind === 'credit') {
        const c = a.card
        if (!isObject(c) || !isDay(c.closingDay) || !isDay(c.dueDay) || !isId(c.bankAccountId) ||
          (c.limit !== undefined && !(Number.isSafeInteger(c.limit) && (c.limit as number) >= 0))) {
          throw new BackupError(`Cartão ${i + 1} do backup está com configuração inválida.`)
        }
        const card: CardSettings = { closingDay: c.closingDay, dueDay: c.dueDay, bankAccountId: c.bankAccountId }
        if (c.limit !== undefined) card.limit = c.limit as number
        account.card = card
      }
      return account
    })
  const accountById = new Map(accounts.map(a => [a.id as number, a]))
  for (const a of accounts) {
    if (a.card) {
      const bank = accountById.get(a.card.bankAccountId)
      if (!bank || bank.kind === 'credit') throw new BackupError(`O cartão "${a.name}" aponta para uma conta inválida.`)
    }
  }

  // ── Purchases (v3+)
  const purchases: Purchase[] = v < 3 ? [] : (data.purchases as unknown[]).map((p, i) => {
    if (
      !isObject(p) || !isId(p.id) || !isId(p.accountId) || !isId(p.categoryId) || !isId(p.total) ||
      !Number.isInteger(p.installments) || (p.installments as number) < 1 ||
      !isISODate(p.date) || !isMonth(p.firstInvoice) || typeof p.createdAt !== 'number' || !isOptStr(p.description)
    ) {
      throw new BackupError(`Compra ${i + 1} do backup está corrompida.`)
    }
    if (accountById.get(p.accountId)?.kind !== 'credit') throw new BackupError(`Compra ${i + 1} do backup não está em um cartão.`)
    if (categoryById.get(p.categoryId)?.type !== 'expense') throw new BackupError(`Compra ${i + 1} do backup tem categoria inválida.`)
    const purchase: Purchase = {
      id: p.id, accountId: p.accountId, categoryId: p.categoryId, total: p.total, installments: p.installments as number,
      date: p.date, firstInvoice: p.firstInvoice, createdAt: p.createdAt,
    }
    if (p.description) purchase.description = p.description as string
    if (typeof p.updatedAt === 'number') purchase.updatedAt = p.updatedAt
    return purchase
  })
  const purchaseById = new Map(purchases.map(p => [p.id as number, p]))

  // ── Transactions
  const transactions: Transaction[] = data.transactions.map((t, i) => {
    if (
      !isObject(t) || !isId(t.id) || !(v >= 5 ? isTxType(t.type) : isType(t.type)) ||
      !isId(t.amount) || // positive integer centavos
      !isId(t.categoryId) ||
      (v >= 2 && !isId(t.accountId)) ||
      !isISODate(t.date) ||
      (v >= 3 && !isMonth(t.month)) ||
      typeof t.createdAt !== 'number' ||
      !isOptStr(t.description) ||
      (t.method !== undefined && !(typeof t.method === 'string' && t.method in PAYMENT_METHODS))
    ) {
      throw new BackupError(`Lançamento ${i + 1} do backup está corrompido.`)
    }
    if (!categoryById.has(t.categoryId)) {
      throw new BackupError(`Lançamento ${i + 1} do backup aponta para uma categoria que não existe.`)
    }
    const accountId = v < 2 ? 1 : t.accountId as number
    const account = accountById.get(accountId)
    if (!account) throw new BackupError(`Lançamento ${i + 1} do backup aponta para uma conta que não existe.`)

    const tx: Transaction = {
      id: t.id, type: t.type as Transaction['type'], amount: t.amount, categoryId: t.categoryId, accountId,
      date: t.date, month: v >= 3 ? t.month as string : t.date.slice(0, 7), createdAt: t.createdAt,
    }
    if (t.description) tx.description = t.description as string
    if (typeof t.updatedAt === 'number') tx.updatedAt = t.updatedAt
    // Pre-v3 rows had no method: same rule as the v5 database upgrade (Pix; cash in wallets)
    tx.method = (t.method as PaymentMethod | undefined) ?? (v < 3 ? (account.kind === 'wallet' ? 'cash' : 'pix') : undefined)
    if (!tx.method) delete tx.method

    if (t.purchaseId !== undefined) {
      if (!isId(t.purchaseId) || !purchaseById.has(t.purchaseId) || !Number.isInteger(t.installment) ||
        !Number.isInteger(t.installments) || !isMonth(t.invoiceMonth)) {
        throw new BackupError(`Parcela ${i + 1} do backup está corrompida.`)
      }
      Object.assign(tx, { purchaseId: t.purchaseId, installment: t.installment, installments: t.installments, invoiceMonth: t.invoiceMonth })
    }
    if (tx.type === 'refund') {
      if ((t.refundOf === undefined) === (t.refundOfPurchase === undefined)) throw new BackupError(`Estorno ${i + 1} do backup está corrompido.`)
      if (t.refundOf !== undefined) {
        if (!isId(t.refundOf)) throw new BackupError(`Estorno ${i + 1} do backup está corrompido.`)
        tx.refundOf = t.refundOf
      } else {
        if (!isId(t.refundOfPurchase) || !purchaseById.has(t.refundOfPurchase) || !isMonth(t.invoiceMonth)) throw new BackupError(`Estorno ${i + 1} do backup está corrompido.`)
        tx.refundOfPurchase = t.refundOfPurchase
        tx.invoiceMonth = t.invoiceMonth
      }
    }
    if (t.loanEventId !== undefined) {
      if (!isId(t.loanEventId)) throw new BackupError(`Lançamento ${i + 1} do backup está corrompido.`)
      tx.loanEventId = t.loanEventId
    }
    // Money on a card only enters as installments of a purchase
    const cardRow = (tx.purchaseId !== undefined && tx.type === 'expense') || (tx.type === 'refund' && tx.refundOfPurchase !== undefined)
    if (account.kind === 'credit' && (!cardRow || tx.method !== 'credit')) {
      throw new BackupError(`Lançamento ${i + 1} do backup está num cartão sem ser parcela de compra.`)
    }
    if (account.kind === 'loan') throw new BackupError(`Lançamento ${i + 1} do backup está numa conta de empréstimo.`)
    return tx
  })

  // Each purchase's installments must be exactly 1..N, on its card, and sum to its total
  for (const p of purchases) {
    const rows = transactions.filter(t => t.purchaseId === p.id).sort((a, b) => a.installment! - b.installment!)
    const expected = splitInstallments(p.total, p.installments)
    const ok = rows.length === p.installments && rows.every((r, k) =>
      r.installment === k + 1 && r.installments === p.installments && r.accountId === p.accountId &&
      r.amount === expected[k] && r.invoiceMonth === addMonthsKey(p.firstInvoice, k) && r.month === r.invoiceMonth)
    if (!ok) throw new BackupError(`As parcelas da compra "${p.description ?? p.id}" no backup não fecham com o total.`)
  }

  // Refunds never exceed what they refund, and point at an expense of the same category
  const txById = new Map(transactions.map(t => [t.id as number, t]))
  const refundedTx = new Map<number, number>()
  const refundedPurchase = new Map<number, number>()
  for (const t of transactions) {
    if (t.type !== 'refund') continue
    if (t.refundOf !== undefined) {
      const o = txById.get(t.refundOf)
      if (!o || o.type !== 'expense' || o.categoryId !== t.categoryId || o.accountId !== t.accountId) throw new BackupError('Um estorno do backup aponta para uma despesa inválida.')
      refundedTx.set(o.id!, (refundedTx.get(o.id!) ?? 0) + t.amount)
      if (refundedTx.get(o.id!)! > o.amount) throw new BackupError('Um estorno do backup passa do valor da despesa.')
    } else {
      const p = purchaseById.get(t.refundOfPurchase!)!
      if (p.accountId !== t.accountId || p.categoryId !== t.categoryId) throw new BackupError('Um estorno do backup aponta para uma compra inválida.')
      refundedPurchase.set(p.id!, (refundedPurchase.get(p.id!) ?? 0) + t.amount)
      if (refundedPurchase.get(p.id!)! > p.total) throw new BackupError('Um estorno do backup passa do valor da compra.')
    }
  }

  // ── Transfers
  const transfers: Transfer[] = v < 2 ? [] : (data.transfers as unknown[]).map((t, i) => {
    if (
      !isObject(t) || !isId(t.id) || !isId(t.amount) ||
      !isId(t.fromAccountId) || !isId(t.toAccountId) ||
      !isISODate(t.date) || typeof t.createdAt !== 'number' ||
      !isOptStr(t.description) ||
      (t.updatedAt !== undefined && typeof t.updatedAt !== 'number') ||
      (t.invoiceMonth !== undefined && !isMonth(t.invoiceMonth))
    ) {
      throw new BackupError(`Transferência ${i + 1} do backup está corrompida.`)
    }
    const from = accountById.get(t.fromAccountId)
    const to = accountById.get(t.toAccountId)
    const isRelease = t.loanId !== undefined
    if (t.fromAccountId === t.toAccountId || !from || !to || from.kind === 'credit' ||
      (t.invoiceMonth !== undefined && to.kind !== 'credit') ||
      (isRelease ? !isId(t.loanId) || from.kind !== 'loan' : from.kind === 'loan' || to.kind === 'loan')) {
      throw new BackupError(`Transferência ${i + 1} do backup aponta para contas inválidas.`)
    }
    const tr: Transfer = {
      id: t.id, fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, amount: t.amount,
      date: t.date, createdAt: t.createdAt,
    }
    if (t.description) tr.description = t.description as string
    if (t.updatedAt !== undefined) tr.updatedAt = t.updatedAt as number
    if (t.invoiceMonth !== undefined) tr.invoiceMonth = t.invoiceMonth as string
    if (isRelease) tr.loanId = t.loanId as number
    return tr
  })

  const { loans, loanEvents } = parseLoans(data, v, accountById, categoryById, transactions, transfers)
  const { budgets, budgetOverrides } = parseBudgets(data, v, categoryById)

  return {
    app: 'centavo',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    categories,
    transactions,
    accounts,
    transfers,
    purchases,
    loans,
    loanEvents,
    budgets,
    budgetOverrides,
  }
}

function parseBudgets(data: Record<string, unknown>, v: number, categoryById: Map<number, Category>) {
  if (v < 5) return { budgets: [] as BudgetPlan[], budgetOverrides: [] as BudgetOverride[] }
  const expenseCat = (id: unknown) => isId(id) && categoryById.get(id)?.type === 'expense'
  const budgets: BudgetPlan[] = (data.budgets as unknown[]).map((b, i) => {
    if (!isObject(b) || !isId(b.id) || !expenseCat(b.categoryId) || !isMonth(b.from) ||
      !(b.amount === null || isId(b.amount)) || typeof b.createdAt !== 'number') {
      throw new BackupError(`Orçamento ${i + 1} do backup está corrompido.`)
    }
    return { id: b.id, categoryId: b.categoryId as number, from: b.from, amount: b.amount as number | null, createdAt: b.createdAt }
  })
  const seen = new Set<string>()
  const budgetOverrides: BudgetOverride[] = (data.budgetOverrides as unknown[]).map((o, i) => {
    if (!isObject(o) || !isId(o.id) || !expenseCat(o.categoryId) || !isMonth(o.month) || !isId(o.amount)) {
      throw new BackupError(`Exceção de orçamento ${i + 1} do backup está corrompida.`)
    }
    const key = `${o.categoryId}:${o.month}`
    if (seen.has(key)) throw new BackupError('O backup tem duas exceções de orçamento para o mesmo mês.')
    seen.add(key)
    return { id: o.id, categoryId: o.categoryId as number, month: o.month, amount: o.amount }
  })
  return { budgets, budgetOverrides }
}

const sameState = (a: LoanState, b: unknown) =>
  isObject(b) && (['balance', 'next', 'remaining', 'payment', 'amortization', 'accruedDays'] as const).every(k => a[k] === b[k])

/**
 * Loans are validated by replaying them: every stored snapshot must equal what the engine
 * computes from the contract and the previous event, and every generated expense must exist.
 */
function parseLoans(
  data: Record<string, unknown>, v: number, accountById: Map<number, Account>, categoryById: Map<number, Category>,
  transactions: Transaction[], transfers: Transfer[],
): { loans: Loan[]; loanEvents: LoanEvent[] } {
  if (v < 4) return { loans: [], loanEvents: [] }
  const txById = new Map(transactions.map(t => [t.id as number, t]))

  const loans: Loan[] = (data.loans as unknown[]).map((l, i) => {
    const bad = () => new BackupError(`Empréstimo ${i + 1} do backup está corrompido.`)
    if (
      !isObject(l) || !isId(l.id) || !isId(l.accountId) || typeof l.type !== 'string' || !(l.type in LOAN_TYPES) ||
      !isId(l.principal) || !isObject(l.rate) || typeof l.rate.value !== 'string' || (l.rate.unit !== 'monthly' && l.rate.unit !== 'annual') ||
      !Number.isInteger(l.termMonths) || (l.termMonths as number) < 1 || (l.termMonths as number) > 600 ||
      (l.system !== 'price' && l.system !== 'sac') || !isISODate(l.startDate) || !isISODate(l.firstDueDate) ||
      (l.release !== 'deposit' && l.release !== 'direct') || !isId(l.payFromAccountId) ||
      !isId(l.principalCategoryId) || !isId(l.interestCategoryId) || typeof l.method !== 'string' || !(l.method in PAYMENT_METHODS) ||
      typeof l.createdAt !== 'number' || (l.monthlyFees !== undefined && !(Number.isSafeInteger(l.monthlyFees) && (l.monthlyFees as number) >= 0))
    ) throw bad()
    try { dec(l.rate.value) } catch { throw bad() }
    if (accountById.get(l.accountId)?.kind !== 'loan') throw bad()
    if (!accountById.has(l.payFromAccountId)) throw bad()
    if (l.release === 'deposit' && !(isId(l.releaseAccountId) && accountById.has(l.releaseAccountId))) throw bad()
    if (categoryById.get(l.principalCategoryId)?.type !== 'expense' || categoryById.get(l.interestCategoryId)?.type !== 'expense') throw bad()
    const loan: Loan = {
      id: l.id, accountId: l.accountId, type: l.type as Loan['type'], principal: l.principal,
      rate: { value: l.rate.value, unit: l.rate.unit }, termMonths: l.termMonths as number, system: l.system,
      startDate: l.startDate, firstDueDate: l.firstDueDate, release: l.release, payFromAccountId: l.payFromAccountId,
      principalCategoryId: l.principalCategoryId, interestCategoryId: l.interestCategoryId,
      method: l.method as PaymentMethod, createdAt: l.createdAt,
    }
    if (l.monthlyFees) loan.monthlyFees = l.monthlyFees as number
    if (l.release === 'deposit') loan.releaseAccountId = l.releaseAccountId as number
    return loan
  })

  const loanEvents: LoanEvent[] = (data.loanEvents as unknown[]).map((e, i) => {
    if (
      !isObject(e) || !isId(e.id) || !isId(e.loanId) || !Number.isInteger(e.seq) ||
      !['release', 'payment', 'prepayment', 'adjust'].includes(e.kind as string) || !isISODate(e.date) ||
      !Number.isSafeInteger(e.amount) || !Number.isSafeInteger(e.interest) || !Number.isSafeInteger(e.principal) ||
      !Number.isSafeInteger(e.fees) || !isObject(e.state) || !Array.isArray(e.transactionIds) || typeof e.createdAt !== 'number'
    ) throw new BackupError(`Movimento de empréstimo ${i + 1} do backup está corrompido.`)
    const ev: LoanEvent = {
      id: e.id, loanId: e.loanId, seq: e.seq as number, kind: e.kind as LoanEvent['kind'], date: e.date,
      amount: e.amount as number, interest: e.interest as number, principal: e.principal as number, fees: e.fees as number,
      state: e.state as unknown as LoanState, transactionIds: (e.transactionIds as unknown[]).map(Number), createdAt: e.createdAt,
    }
    if (e.installment !== undefined) ev.installment = e.installment as number
    if (e.mode === 'reduce-term' || e.mode === 'reduce-payment') ev.mode = e.mode
    if (e.transferId !== undefined) ev.transferId = e.transferId as number
    return ev
  })

  for (const loan of loans) {
    const fail = () => new BackupError(`O histórico do empréstimo "${accountById.get(loan.accountId)?.name ?? loan.id}" no backup não fecha com o contrato.`)
    const terms = loanTerms(loan)
    const evs = loanEvents.filter(e => e.loanId === loan.id).sort((a, b) => a.seq - b.seq)
    if (evs.length === 0 || evs[0].kind !== 'release' || evs.some((e, k) => e.seq !== k + 1)) throw fail()
    let state = initialState(terms)
    if (!sameState(state, evs[0].state)) throw fail()
    if (loan.release === 'deposit') {
      const tr = transfers.find(t => t.id === evs[0].transferId)
      if (!tr || tr.loanId !== loan.id || tr.amount !== loan.principal || tr.fromAccountId !== loan.accountId) throw fail()
    }
    for (const e of evs.slice(1)) {
      try {
        if (e.kind === 'payment') {
          const r = nextInstallment(terms, state)
          if (r.inst.n !== e.installment || r.inst.interest !== e.interest || r.inst.principal !== e.principal || r.inst.fees !== e.fees) throw fail()
          state = r.state
        } else if (e.kind === 'prepayment') {
          const r = prepayment(terms, state, e.date, e.amount, e.mode ?? 'reduce-term')
          if (r.interest !== e.interest || r.principal !== e.principal) throw fail()
          state = r.state
        } else if (e.kind === 'adjust') {
          if (e.principal !== state.balance - e.amount) throw fail()
          state = adjustBalance(terms, state, e.amount)
        } else throw fail()
      } catch (err) {
        throw err instanceof BackupError ? err : fail()
      }
      if (!sameState(state, e.state)) throw fail()
      const cash = e.transactionIds.reduce((sum, id) => {
        const t = txById.get(id)
        if (!t || t.loanEventId !== e.id || t.type !== 'expense') throw fail()
        return sum + t.amount
      }, 0)
      if (e.kind !== 'adjust' && cash !== e.amount) throw fail()
    }
  }
  return { loans, loanEvents }
}

/** Replace all data with the backup's. All-or-nothing: on failure nothing changes. */
export async function restoreBackup(backup: Backup, db: CentavoDB = defaultDb): Promise<void> {
  const tables = [db.categories, db.transactions, db.accounts, db.transfers, db.purchases, db.loans, db.loanEvents, db.budgets, db.budgetOverrides]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map(t => t.clear()))
    await db.categories.bulkAdd(backup.categories)
    await db.accounts.bulkAdd(backup.accounts)
    await db.purchases.bulkAdd(backup.purchases)
    await db.loans.bulkAdd(backup.loans)
    await db.loanEvents.bulkAdd(backup.loanEvents)
    await db.budgets.bulkAdd(backup.budgets)
    await db.budgetOverrides.bulkAdd(backup.budgetOverrides)
    await db.transactions.bulkAdd(backup.transactions)
    await db.transfers.bulkAdd(backup.transfers)
  })
}
