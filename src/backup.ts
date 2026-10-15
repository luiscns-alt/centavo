import { db as defaultDb, type CentavoDB, type Category, type Transaction } from './db'

export const BACKUP_FORMAT_VERSION = 1

export interface Backup {
  app: 'centavo'
  version: number
  exportedAt: string // ISO timestamp
  categories: Category[]
  transactions: Transaction[]
}

/** Error with a message meant to be shown to the user as-is */
export class BackupError extends Error {}

export async function createBackup(db: CentavoDB = defaultDb): Promise<Backup> {
  // One read transaction so categories and transactions are a consistent snapshot
  return db.transaction('r', db.categories, db.transactions, async () => ({
    app: 'centavo' as const,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
  }))
}

export function backupFilename(date: string): string {
  return `centavo-backup-${date}.json`
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const isType = (v: unknown): v is 'income' | 'expense' => v === 'income' || v === 'expense'

/**
 * Parse and validate a backup file's text. Throws BackupError with a pt-BR
 * message on anything malformed, so a bad file never reaches the database.
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

  const categories: Category[] = data.categories.map((c, i) => {
    if (!isObject(c) || !isId(c.id) || typeof c.name !== 'string' || !isType(c.type) || typeof c.icon !== 'string') {
      throw new BackupError(`Categoria ${i + 1} do backup está corrompida.`)
    }
    return { id: c.id, name: c.name, type: c.type, icon: c.icon }
  })

  const categoryIds = new Set(categories.map(c => c.id))

  const transactions: Transaction[] = data.transactions.map((t, i) => {
    if (
      !isObject(t) ||
      !isId(t.id) ||
      !isType(t.type) ||
      !isId(t.amount) || // positive integer centavos
      !isId(t.categoryId) ||
      typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      typeof t.createdAt !== 'number' ||
      (t.description !== undefined && typeof t.description !== 'string')
    ) {
      throw new BackupError(`Lançamento ${i + 1} do backup está corrompido.`)
    }
    if (!categoryIds.has(t.categoryId)) {
      throw new BackupError(`Lançamento ${i + 1} do backup aponta para uma categoria que não existe.`)
    }
    const tx: Transaction = {
      id: t.id, type: t.type, amount: t.amount, categoryId: t.categoryId,
      date: t.date, createdAt: t.createdAt,
    }
    if (t.description) tx.description = t.description
    return tx
  })

  return {
    app: 'centavo',
    version: data.version,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    categories,
    transactions,
  }
}

/** Replace all data with the backup's. All-or-nothing: on failure nothing changes. */
export async function restoreBackup(backup: Backup, db: CentavoDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.categories, db.transactions, async () => {
    await db.transactions.clear()
    await db.categories.clear()
    await db.categories.bulkAdd(backup.categories)
    await db.transactions.bulkAdd(backup.transactions)
  })
}
