import Dexie, { type EntityTable } from 'dexie'
import type { Account, BudgetOverride, BudgetPlan, Category, Loan, LoanEvent, Purchase, Transaction, Transfer } from './types'
import { firstGrapheme } from '../shared/utils/text'
import { toISODate } from '../shared/utils/dates'

/** Name given to the account that receives pre-v4 transactions */
export const MIGRATED_ACCOUNT_NAME = 'Conta principal'

/** Categories that shipped with v1/v2 — kept in this order so existing ids line up */
const ORIGINAL_CATEGORIES: Omit<Category, 'id'>[] = [
  // Income
  { name: 'Salário',        type: 'income',  icon: '💼' },
  { name: 'Freelance',      type: 'income',  icon: '💻' },
  { name: 'Investimentos',  type: 'income',  icon: '📈' },
  { name: 'Presente',       type: 'income',  icon: '🎁' },
  { name: 'Outros',         type: 'income',  icon: '➕' },
  // Expense
  { name: 'Alimentação',    type: 'expense', icon: '🍔' },
  { name: 'Transporte',     type: 'expense', icon: '🚗' },
  { name: 'Moradia',        type: 'expense', icon: '🏠' },
  { name: 'Entretenimento', type: 'expense', icon: '🎬' },
  { name: 'Saúde',          type: 'expense', icon: '💊' },
  { name: 'Compras',        type: 'expense', icon: '🛍️' },
  { name: 'Contas',         type: 'expense', icon: '📄' },
  { name: 'Educação',       type: 'expense', icon: '📚' },
  { name: 'Outros',         type: 'expense', icon: '➕' },
]

/** Added in v3 — seeded on new installs and merged into existing databases by the v3 upgrade */
export const V3_CATEGORIES: Omit<Category, 'id'>[] = [
  // Income extras
  { name: '13º e bônus',       type: 'income',  icon: '🎉' },
  { name: 'Reembolso',         type: 'income',  icon: '↩️' },
  { name: 'Aluguel recebido',  type: 'income',  icon: '🔑' },
  { name: 'Vendas',            type: 'income',  icon: '🏷️' },
  // Day-to-day expenses
  { name: 'Mercado',           type: 'expense', icon: '🛒' },
  { name: 'Assinaturas',       type: 'expense', icon: '📺' },
  { name: 'Pets',              type: 'expense', icon: '🐾' },
  { name: 'Viagem',            type: 'expense', icon: '✈️' },
  { name: 'Cuidados pessoais', type: 'expense', icon: '💇' },
  { name: 'Presentes',         type: 'expense', icon: '🎁' },
  // Financial expenses
  { name: 'Impostos',          type: 'expense', icon: '🧾' },
  { name: 'Cartão e juros',    type: 'expense', icon: '💳' },
  { name: 'Doações',           type: 'expense', icon: '🤝' },
  { name: 'Aportes',           type: 'expense', icon: '🏦' },
]

/** Added in v6 — the default categories for loan installments */
export const V6_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Financiamentos',   type: 'expense', icon: '🏡' },
  { name: 'Juros e encargos', type: 'expense', icon: '📉' },
]

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [...ORIGINAL_CATEGORIES, ...V3_CATEGORIES, ...V6_CATEGORIES]

/**
 * Display order for chips and lists: built-ins in a curated order, then the user's own
 * categories (oldest first), and "Outros" always last.
 */
const DISPLAY_ORDER = [
  'Salário', 'Freelance', '13º e bônus', 'Investimentos', 'Aluguel recebido', 'Vendas', 'Reembolso', 'Presente',
  'Alimentação', 'Mercado', 'Transporte', 'Moradia', 'Contas', 'Saúde', 'Cuidados pessoais', 'Educação',
  'Entretenimento', 'Assinaturas', 'Compras', 'Viagem', 'Pets', 'Presentes', 'Impostos', 'Cartão e juros',
  'Doações', 'Aportes', 'Financiamentos', 'Juros e encargos',
]

export function sortCategories<T extends Pick<Category, 'id' | 'name' | 'parentId'>>(categories: T[]): T[] {
  const rank = (c: T) => {
    if (c.name === 'Outros') return 1e9
    const i = DISPLAY_ORDER.indexOf(c.name)
    return i >= 0 ? i : 1e6 + (c.id ?? 0)
  }
  const byRank = (a: T, b: T) => rank(a) - rank(b)
  const ids = new Set(categories.map(c => c.id))
  // Top level (and orphans whose parent isn't in the list), each followed by its children
  const top = categories.filter(c => c.parentId === undefined || !ids.has(c.parentId)).sort(byRank)
  return top.flatMap(p => [p, ...categories.filter(c => c.parentId === p.id).sort(byRank)])
}

/** Shape of a v1 transaction row, read only during the v1 → v2 upgrade */
interface TransactionV1 {
  accountId?: number
  categoryId: number
  amount: number              // float reais
  type: 'income' | 'expense' | 'transfer'
  description?: string
  date: Date | string
  createdAt: Date | number
}

/** Convert a v1 row in place to the v2 shape; returns false if it must be dropped */
export function upgradeTransactionV1(row: Record<string, unknown>): boolean {
  const v1 = row as unknown as TransactionV1
  // Transfers moved money between accounts, which no longer exist
  if (v1.type === 'transfer') return false
  if (typeof v1.amount !== 'number' || !Number.isFinite(v1.amount)) return false

  const date = v1.date instanceof Date ? toISODate(v1.date) : v1.date
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

  const tx = row as unknown as Transaction
  tx.amount = Math.round(Math.abs(v1.amount) * 100)
  tx.date = date
  tx.createdAt = v1.createdAt instanceof Date ? v1.createdAt.getTime() : Number(v1.createdAt) || Date.now()
  if (!tx.description) delete tx.description
  delete row.accountId
  return true
}

export class CentavoDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  accounts!: EntityTable<Account, 'id'>
  transfers!: EntityTable<Transfer, 'id'>
  purchases!: EntityTable<Purchase, 'id'>
  loans!: EntityTable<Loan, 'id'>
  loanEvents!: EntityTable<LoanEvent, 'id'>
  budgets!: EntityTable<BudgetPlan, 'id'>
  budgetOverrides!: EntityTable<BudgetOverride, 'id'>

  constructor(name = 'centavoDB') {
    // 'strict': Chrome only reports a write as committed once it is flushed to disk
    super(name, { chromeTransactionDurability: 'strict' })

    // v1 had accounts + transactions with accountId, float amounts, Date objects
    this.version(1).stores({
      accounts: '++id, type, currency, createdAt',
      categories: '++id, type',
      transactions: '++id, accountId, categoryId, type, date, createdAt',
    })

    // v2: remove accounts, simplify transactions (no accountId, integer centavos, date string).
    // Existing rows are converted, not cleared — only transfers are dropped.
    this.version(2).stores({
      accounts: null,
      categories: '++id, type',
      transactions: '++id, categoryId, type, date, createdAt',
    }).upgrade(tx =>
      tx.table('transactions').toCollection().modify((row, ref) => {
        if (!upgradeTransactionV1(row)) delete (ref as { value?: unknown }).value
      })
    )

    // v3: more default categories. Only adds the ones missing (by type + name) — never touches existing rows.
    this.version(3).stores({
      categories: '++id, type',
      transactions: '++id, categoryId, type, date, createdAt',
    }).upgrade(async tx => {
      const table = tx.table<Category, number>('categories')
      const existing = await table.toArray()
      const have = new Set(existing.map(c => `${c.type}:${c.name.toLocaleLowerCase('pt-BR')}`))
      const missing = V3_CATEGORIES.filter(c => !have.has(`${c.type}:${c.name.toLocaleLowerCase('pt-BR')}`))
      if (missing.length) await table.bulkAdd(missing as Category[])
    })

    // v4: multiple accounts + transfers. Existing transactions move to one account, in the
    // same upgrade transaction — if anything fails the database stays at v3, untouched.
    this.version(4).stores({
      categories: '++id, type',
      transactions: '++id, categoryId, accountId, type, date, createdAt, [accountId+date]',
      accounts: '++id, archived',
      transfers: '++id, fromAccountId, toAccountId, date, createdAt',
    }).upgrade(async tx => {
      const transactions = tx.table<Transaction, number>('transactions')
      if ((await transactions.count()) === 0) return // nothing to adopt: the user names their first account
      const accountId = await tx.table<Account, number>('accounts').add({
        name: MIGRATED_ACCOUNT_NAME,
        kind: 'checking',
        icon: '🏦',
        openingBalance: 0,
        openingDate: '1970-01-01',
        archived: 0,
        createdAt: Date.now(),
      } as Account)
      await transactions.toCollection().modify(t => { t.accountId = accountId })
    })

    // v5: credit cards. Transactions gain `month` (report month, indexed) and a payment
    // method; card purchases live in `purchases` with their installments in `transactions`.
    // Existing rows: month = their date's month; method = Pix (cash in wallets), as agreed —
    // the user can correct each one by editing it.
    this.version(5).stores({
      categories: '++id, type',
      transactions: '++id, categoryId, accountId, type, date, month, purchaseId, createdAt, [accountId+date], [accountId+month]',
      accounts: '++id, archived',
      transfers: '++id, fromAccountId, toAccountId, date, createdAt, [toAccountId+invoiceMonth]',
      purchases: '++id, accountId, date',
    }).upgrade(async tx => {
      const accounts = await tx.table<Account, number>('accounts').toArray()
      const kindOf = new Map(accounts.map(a => [a.id as number, a.kind]))
      await tx.table<Transaction, number>('transactions').toCollection().modify(t => {
        t.month = t.date.slice(0, 7)
        if (!t.method) t.method = kindOf.get(t.accountId) === 'wallet' ? 'cash' : 'pix'
      })
    })

    // v6: loans and financing. The default categories for installments are added if missing.
    this.version(6).stores({
      categories: '++id, type',
      transactions: '++id, categoryId, accountId, type, date, month, purchaseId, loanEventId, createdAt, [accountId+date], [accountId+month]',
      accounts: '++id, archived',
      transfers: '++id, fromAccountId, toAccountId, date, createdAt, [toAccountId+invoiceMonth]',
      purchases: '++id, accountId, date',
      loans: '++id, accountId',
      loanEvents: '++id, loanId, [loanId+seq]',
    }).upgrade(async tx => {
      const table = tx.table<Category, number>('categories')
      const existing = await table.toArray()
      const have = new Set(existing.map(c => `${c.type}:${c.name.toLocaleLowerCase('pt-BR')}`))
      const missing = V6_CATEGORIES.filter(c => !have.has(`${c.type}:${c.name.toLocaleLowerCase('pt-BR')}`))
      if (missing.length) await table.bulkAdd(missing as Category[])
    })

    // v7: subcategories (parentId), budgets and refunds. Nothing existing changes.
    this.version(7).stores({
      categories: '++id, type, parentId',
      transactions: '++id, categoryId, accountId, type, date, month, purchaseId, loanEventId, refundOf, refundOfPurchase, createdAt, [accountId+date], [accountId+month]',
      accounts: '++id, archived',
      transfers: '++id, fromAccountId, toAccountId, date, createdAt, [toAccountId+invoiceMonth]',
      purchases: '++id, accountId, date',
      loans: '++id, accountId',
      loanEvents: '++id, loanId, [loanId+seq]',
      budgets: '++id, categoryId, [categoryId+from]',
      budgetOverrides: '++id, &[categoryId+month]',
    })

    this.on('populate', async () => {
      await this.categories.bulkAdd(DEFAULT_CATEGORIES as Category[])
    })
  }
}

export const db = new CentavoDB()

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Categories ──────────────────────────────────────────────────────────────

export class CategoryError extends Error {}

const NAME_MAX = 24

/** Trim, validate and de-duplicate (per type, case-insensitive) a category name */
async function checkCategoryName(database: CentavoDB, name: string, type: Category['type'], ignoreId?: number): Promise<string> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (clean === '') throw new CategoryError('Dê um nome para a categoria.')
  if (clean.length > NAME_MAX) throw new CategoryError(`Use até ${NAME_MAX} caracteres.`)
  const key = clean.toLocaleLowerCase('pt-BR')
  const clash = await database.categories
    .where('type').equals(type)
    .filter(c => c.id !== ignoreId && c.name.toLocaleLowerCase('pt-BR') === key)
    .first()
  if (clash) throw new CategoryError(`Já existe uma categoria "${clash.name}".`)
  return clean
}

/** A valid parent for a category of `type`: exists, same type, top-level, not itself */
async function checkParent(database: CentavoDB, parentId: number | null | undefined, type: Category['type'], selfId?: number) {
  if (parentId === null || parentId === undefined) return undefined
  const parent = await database.categories.get(parentId)
  if (!parent) throw new CategoryError('Categoria principal não encontrada.')
  if (parent.id === selfId) throw new CategoryError('Uma categoria não pode ficar dentro dela mesma.')
  if (parent.type !== type) throw new CategoryError('A subcategoria precisa ser do mesmo tipo da principal.')
  if (parent.parentId !== undefined) throw new CategoryError('Só dá para criar subcategorias em dois níveis.')
  return parent.id
}

export async function addCategory(
  input: { name: string; icon: string; type: Category['type']; parentId?: number | null },
  database: CentavoDB = db,
): Promise<number> {
  return database.transaction('rw', database.categories, async () => {
    const name = await checkCategoryName(database, input.name, input.type)
    const parentId = await checkParent(database, input.parentId, input.type)
    const cat: Category = { name, type: input.type, icon: firstGrapheme(input.icon) || '🏷️' }
    if (parentId !== undefined) cat.parentId = parentId
    return database.categories.add(cat) as Promise<number>
  })
}

/** Rename, re-icon, and (parentId given) move under another category or to the top (null) */
export async function updateCategory(
  id: number,
  input: { name: string; icon: string; parentId?: number | null },
  database: CentavoDB = db,
): Promise<void> {
  await database.transaction('rw', database.categories, async () => {
    const current = await database.categories.get(id)
    if (!current) throw new CategoryError('Categoria não encontrada.')
    const name = await checkCategoryName(database, input.name, current.type, id)
    const next: Category = { ...current, name, icon: firstGrapheme(input.icon) || current.icon }
    if (input.parentId !== undefined) {
      const parentId = await checkParent(database, input.parentId, current.type, id)
      if (parentId !== undefined && (await database.categories.where('parentId').equals(id).count()) > 0) {
        throw new CategoryError('Esta categoria tem subcategorias — ela não pode virar subcategoria.')
      }
      if (parentId === undefined) delete next.parentId
      else next.parentId = parentId
    }
    await database.categories.put(next)
  })
}

export async function deleteCategory(id: number, database: CentavoDB = db): Promise<void> {
  await database.transaction('rw', [database.categories, database.transactions, database.loans, database.budgets, database.budgetOverrides], async () => {
    const used = await database.transactions.where('categoryId').equals(id).count()
    if (used > 0) throw new CategoryError('Categoria em uso — não dá para excluir.')
    if ((await database.categories.where('parentId').equals(id).count()) > 0) {
      throw new CategoryError('A categoria tem subcategorias — mova ou exclua-as antes.')
    }
    if ((await database.loans.filter(l => l.principalCategoryId === id || l.interestCategoryId === id).count()) > 0) {
      throw new CategoryError('Categoria usada por um empréstimo — não dá para excluir.')
    }
    // Its budgets go with it
    await database.budgets.where('categoryId').equals(id).delete()
    await database.budgetOverrides.filter(o => o.categoryId === id).delete()
    await database.categories.delete(id)
  })
}
