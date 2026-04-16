import Dexie, { type EntityTable } from 'dexie'

export interface Account {
  id: number
  name: string
  type: 'checking' | 'savings' | 'credit' | 'cash'
  balance: number
  currency: string
  createdAt: Date
}

export interface Category {
  id: number
  name: string
  type: 'income' | 'expense'
  icon: string
  color: string
}

export interface Transaction {
  id: number
  accountId: number
  categoryId: number
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string
  date: Date
  createdAt: Date
}

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  // Income
  { name: 'Salário', type: 'income', icon: '💼', color: '#22c55e' },
  { name: 'Freelance', type: 'income', icon: '💻', color: '#10b981' },
  { name: 'Investimentos', type: 'income', icon: '📈', color: '#3b82f6' },
  { name: 'Presente', type: 'income', icon: '🎁', color: '#a855f7' },
  { name: 'Outros', type: 'income', icon: '➕', color: '#6b7280' },
  // Expense
  { name: 'Alimentação', type: 'expense', icon: '🍔', color: '#f97316' },
  { name: 'Transporte', type: 'expense', icon: '🚗', color: '#eab308' },
  { name: 'Moradia', type: 'expense', icon: '🏠', color: '#ef4444' },
  { name: 'Entretenimento', type: 'expense', icon: '🎬', color: '#ec4899' },
  { name: 'Saúde', type: 'expense', icon: '💊', color: '#14b8a6' },
  { name: 'Compras', type: 'expense', icon: '🛍️', color: '#8b5cf6' },
  { name: 'Contas', type: 'expense', icon: '📄', color: '#64748b' },
  { name: 'Educação', type: 'expense', icon: '📚', color: '#0ea5e9' },
  { name: 'Outros', type: 'expense', icon: '➕', color: '#6b7280' },
]

class CentavoDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>

  constructor() {
    super('centavoDB')

    this.version(1).stores({
      accounts: '++id, type, currency, createdAt',
      categories: '++id, type',
      transactions: '++id, accountId, categoryId, type, date, createdAt',
    })

    this.on('populate', async () => {
      await this.categories.bulkAdd(DEFAULT_CATEGORIES as Category[])
    })
  }
}

export const db = new CentavoDB()
