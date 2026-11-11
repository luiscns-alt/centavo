/** Persisted domain entities (categories) — the shapes stored in IndexedDB (see core/db.ts). */

export interface Category {
  id?: number
  name: string
  type: 'income' | 'expense'
  icon: string
  /** Parent category (v7+). Two levels only: a category with a parent can't have children. */
  parentId?: number
}
