/**
 * Write path — Monthly budgets: versions and one-month exceptions.
 *
 * Every function validates *inside* the same read-write IndexedDB transaction that writes, so a
 * check can't go stale between reading and writing, and any error rolls the whole operation back.
 * Balances are never stored (see features/accounts/balances.ts).
 */
import { db as defaultDb, type CentavoDB } from '../../core/db'
import { LedgerError, isMonthKey, isPositiveCentavos } from '../../core/ledger/base'

// ─── Budgets ─────────────────────────────────────────────────────────────────

async function expenseCategoryFor(database: CentavoDB, categoryId: number) {
  const cat = await database.categories.get(categoryId)
  if (!cat || cat.type !== 'expense') throw new LedgerError('Orçamentos são para categorias de despesa.')
}

/**
 * Monthly limit for a category from `from` onward (amount null = remove the limit from then on).
 * Earlier months keep their limit: versions are only added, or replaced when `from` is the same.
 */
export async function setBudget(
  input: { categoryId: number; from: string; amount: number | null }, database: CentavoDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.budgets, database.categories, async () => {
    await expenseCategoryFor(database, input.categoryId)
    if (!isMonthKey(input.from)) throw new LedgerError('Mês inválido.')
    if (input.amount !== null && !isPositiveCentavos(input.amount)) throw new LedgerError('Informe um limite maior que zero.')
    const same = await database.budgets.where('[categoryId+from]').equals([input.categoryId, input.from]).first()
    if (same) {
      await database.budgets.update(same.id!, { amount: input.amount })
      return
    }
    await database.budgets.add({ categoryId: input.categoryId, from: input.from, amount: input.amount, createdAt: Date.now() })
  })
}

/** A different limit for one month only (amount null = drop the exception) */
export async function setBudgetOverride(
  input: { categoryId: number; month: string; amount: number | null }, database: CentavoDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.budgetOverrides, database.categories, async () => {
    await expenseCategoryFor(database, input.categoryId)
    if (!isMonthKey(input.month)) throw new LedgerError('Mês inválido.')
    const existing = await database.budgetOverrides.where('[categoryId+month]').equals([input.categoryId, input.month]).first()
    if (input.amount === null) {
      if (existing) await database.budgetOverrides.delete(existing.id!)
      return
    }
    if (!isPositiveCentavos(input.amount)) throw new LedgerError('Informe um limite maior que zero.')
    if (existing) await database.budgetOverrides.update(existing.id!, { amount: input.amount })
    else await database.budgetOverrides.add({ categoryId: input.categoryId, month: input.month, amount: input.amount })
  })
}

/**
 * What the Orçamentos editor saves, atomically:
 * - 'from': this limit from `month` on (a new version) and drop this month's exception;
 * - 'once': an exception for `month` only.
 * amount null removes: 'from' ends the budget from `month`, 'once' drops the exception.
 */
export async function saveBudget(
  input: { categoryId: number; month: string; amount: number | null; scope: 'from' | 'once' }, database: CentavoDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.budgets, database.budgetOverrides, database.categories, async () => {
    if (input.scope === 'once') {
      await setBudgetOverride({ categoryId: input.categoryId, month: input.month, amount: input.amount }, database)
      return
    }
    await setBudget({ categoryId: input.categoryId, from: input.month, amount: input.amount }, database)
    await setBudgetOverride({ categoryId: input.categoryId, month: input.month, amount: null }, database)
  })
}
