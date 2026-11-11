/** Persisted domain entities (monthly budgets) — the shapes stored in IndexedDB (see core/db.ts). */

/**
 * Monthly spending limit for a category (v7+). Versions are append-only: the limit of a month is
 * the latest version with from ≤ month (amount null = no limit from then on), unless an override
 * exists for that exact month.
 */
export interface BudgetPlan {
  id?: number
  categoryId: number
  from: string               // YYYY-MM
  amount: number | null      // centavos per month; null = budget removed from this month
  createdAt: number
}

/** A one-off limit for one month ("dezembro tem R$ 1.200") */
export interface BudgetOverride {
  id?: number
  categoryId: number
  month: string              // YYYY-MM
  amount: number
}
