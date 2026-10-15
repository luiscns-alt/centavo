import Dexie, { type EntityTable } from 'dexie'

export interface Category {
  id?: number
  name: string
  type: 'income' | 'expense'
  icon: string
}

export interface Transaction {
  id?: number
  type: 'income' | 'expense'
  amount: number        // integer in centavos — R$12,50 → 1250
  categoryId: number    // FK to categories
  description?: string
  date: string          // YYYY-MM-DD — Dexie range queries rely on lex sort
  createdAt: number     // Unix timestamp ms
}

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
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

class CentavoDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>

  constructor() {
    super('centavoDB')

    // v1 had accounts + transactions with accountId, float amounts, Date objects
    this.version(1).stores({
      accounts: '++id, type, currency, createdAt',
      categories: '++id, type',
      transactions: '++id, accountId, categoryId, type, date, createdAt',
    })

    // v2: remove accounts, simplify transactions (no accountId, integer centavos, date string)
    this.version(2).stores({
      accounts: null,
      categories: '++id, type',
      transactions: '++id, categoryId, type, date, createdAt',
    }).upgrade(tx => tx.table('transactions').clear())

    this.on('populate', async () => {
      await this.categories.bulkAdd(DEFAULT_CATEGORIES as Category[])
    })
  }
}

export const db = new CentavoDB()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format integer centavos as BRL currency string — "R$\u00a012,50" */
export function formatBRL(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}

/** Today as YYYY-MM-DD in local time — toISOString() would return the UTC date (tomorrow after 21h in BRT) */
export function todayISO(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Parse a user-typed amount into integer centavos, or null if invalid.
 * Accepts pt-BR ("1.234,56") and en ("1,234.56", "12.50") styles, since mobile
 * decimal keyboards may show either separator. A lone dot followed by exactly
 * three digits ("1.500") is read as a thousands separator, per pt-BR.
 */
export function parseBRL(raw: string): number | null {
  const s = raw.trim().replace(/^R\$\s*/, '')
  if (s === '') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decimalSep: ',' | '.' | null
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? ',' : '.'
  } else if (lastComma >= 0) {
    decimalSep = ','
  } else if (lastDot >= 0) {
    const singleDot = s.indexOf('.') === lastDot
    decimalSep = singleDot && !/^\d{1,3}\.\d{3}$/.test(s) ? '.' : null
  } else {
    decimalSep = null
  }

  const sepIndex = decimalSep ? s.lastIndexOf(decimalSep) : -1
  const intPart = sepIndex >= 0 ? s.slice(0, sepIndex) : s
  const fracPart = sepIndex >= 0 ? s.slice(sepIndex + 1) : ''

  const thousandsSep = decimalSep === ',' ? '.' : decimalSep === '.' ? ',' : '.'
  const grouped = new RegExp(`^\\d{1,3}(\\${thousandsSep}\\d{3})+$`)
  if (!/^\d+$/.test(intPart) && !grouped.test(intPart)) return null
  if (sepIndex >= 0 && !/^\d{1,2}$/.test(fracPart)) return null

  const reais = Number(intPart.replaceAll(thousandsSep, ''))
  const centavos = Number(fracPart.padEnd(2, '0') || '0')
  return reais * 100 + centavos
}

/** Format YYYY-MM-DD to "14 abr" */
export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
    .format(new Date(y, m - 1, d))
    .replace('.', '')
}

/** First and last day of a month as YYYY-MM-DD strings */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}
