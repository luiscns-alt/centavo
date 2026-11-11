/**
 * Orçamentos — pure, read-only math over the ledger. Nothing here writes; limits are set through
 * ledger.setBudget / setBudgetOverride. All amounts are integer centavos.
 *
 * Rules (DESIGN.md › Orçamentos):
 * - Spending counts in the transaction's report month (`month`): card installments in their
 *   invoice's due month, refunds lower the spending of their category.
 * - Limit for a month = that month's override, else the latest version whose `from` ≤ month
 *   (a version with amount null ends the budget).
 * - Tree: a parent's spending is its own + its children's. A parent's limit covers its children;
 *   a child may have its own (nested) limit. Totals never count a nested limit twice.
 * - Status: ok < 80% ≤ warning ≤ 100% < over.
 */
import type { BudgetOverride, BudgetPlan, Category, Transaction } from '../../core/db'

export const WARN_AT = 0.8

export type BudgetStatus = 'none' | 'ok' | 'warning' | 'over'

export interface Breakdown {
  oneOff: number
  cardInstallments: number
  loan: number
  /** Refunds received (positive — already subtracted from spent) */
  refunds: number
}

export interface BudgetLine {
  category: Category
  limit: number | null
  /** The month's limit comes from a one-off override */
  isOverride: boolean
  spent: number
  breakdown: Breakdown
  /** limit − spent (negative = over) — null without limit */
  remaining: number | null
  ratio: number | null
  status: BudgetStatus
  /** Current month only: share of the limit expected by today, and whether spending is ahead of it */
  pace: { expected: number; ahead: boolean } | null
  /** Loan installments still to be paid this month (not yet in spent) */
  projected: number
  projectedStatus: BudgetStatus
  /** Card installments already booked for the next months, by month (this category + children) */
  committedAhead: { month: string; amount: number }[]
  children: BudgetLine[]
}

export interface BudgetTotals {
  /** Sum of limits not nested in a limited parent */
  budgeted: number
  /** Spending under those limits */
  budgetedSpent: number
  remaining: number
  /** Spending in categories without any limit */
  unbudgetedSpent: number
  /** All expenses of the month (= budgetedSpent + unbudgetedSpent) */
  spent: number
  projected: number
}

export interface BudgetDashboard {
  month: string
  lines: BudgetLine[]
  totals: BudgetTotals
  /** Lines (any level) in warning/over, worst first */
  alerts: BudgetLine[]
  hasBudgets: boolean
}

export interface ForecastItem { categoryId: number; amount: number }

export interface BudgetInput {
  month: string                     // YYYY-MM
  categories: Category[]            // expense categories (others are ignored)
  plans: BudgetPlan[]
  overrides: BudgetOverride[]
  /** Transactions whose report month is `month` */
  transactions: Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'purchaseId' | 'loanEventId'>[]
  /** Booked card installments with month after `month` */
  future?: Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'month'>[]
  /** Unpaid loan installments due in `month` */
  forecast?: ForecastItem[]
  /** YYYY-MM-DD — enables pace when inside `month` */
  today?: string
  /** How many months ahead committedAhead lists (default 3) */
  aheadMonths?: number
}

// ── Limits ────────────────────────────────────────────────────────────────

export function limitFor(
  categoryId: number, month: string, plans: BudgetPlan[], overrides: BudgetOverride[],
): { amount: number | null; isOverride: boolean } {
  const o = overrides.find(x => x.categoryId === categoryId && x.month === month)
  if (o) return { amount: o.amount, isOverride: true }
  let best: BudgetPlan | undefined
  for (const p of plans) {
    if (p.categoryId !== categoryId || p.from > month) continue
    if (!best || p.from > best.from) best = p
  }
  return { amount: best?.amount ?? null, isOverride: false }
}

export function statusOf(spent: number, limit: number | null): BudgetStatus {
  if (limit === null) return 'none'
  if (spent > limit) return 'over'
  if (limit === 0) return 'ok'
  return spent >= limit * WARN_AT ? 'warning' : 'ok'
}

const RANK: Record<BudgetStatus, number> = { none: 0, ok: 1, warning: 2, over: 3 }

/** Which threshold a change crossed upward (for the one-time toast), if any */
export function crossed(before: BudgetStatus, after: BudgetStatus): 'warning' | 'over' | null {
  if (RANK[after] <= RANK[before]) return null
  return after === 'over' ? 'over' : after === 'warning' ? 'warning' : null
}

function addMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

function daysIn(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// ── Dashboard ─────────────────────────────────────────────────────────────

interface Acc { breakdown: Breakdown; projected: number; ahead: Map<string, number> }
const emptyAcc = (): Acc => ({ breakdown: { oneOff: 0, cardInstallments: 0, loan: 0, refunds: 0 }, projected: 0, ahead: new Map() })
const spentOf = (b: Breakdown) => b.oneOff + b.cardInstallments + b.loan - b.refunds

export function buildBudgetDashboard(input: BudgetInput): BudgetDashboard {
  const { month, plans, overrides } = input
  const cats = input.categories.filter(c => c.type === 'expense' && c.id != null)
  const byId = new Map(cats.map(c => [c.id as number, c]))

  // One pass: everything accumulates on the category itself; rollup comes after
  const acc = new Map<number, Acc>()
  const get = (id: number) => {
    let a = acc.get(id)
    if (!a) acc.set(id, (a = emptyAcc()))
    return a
  }
  let spentAll = 0
  for (const t of input.transactions) {
    if (t.type === 'income') continue
    const b = get(t.categoryId).breakdown
    if (t.type === 'refund') { b.refunds += t.amount; spentAll -= t.amount; continue }
    spentAll += t.amount
    if (t.loanEventId != null) b.loan += t.amount
    else if (t.purchaseId != null) b.cardInstallments += t.amount
    else b.oneOff += t.amount
  }
  const aheadEnd = addMonth(month, input.aheadMonths ?? 3)
  for (const t of input.future ?? []) {
    if (t.type !== 'expense' || t.month <= month || t.month > aheadEnd) continue
    const m = get(t.categoryId).ahead
    m.set(t.month, (m.get(t.month) ?? 0) + t.amount)
  }
  let projectedAll = 0
  for (const f of input.forecast ?? []) { get(f.categoryId).projected += f.amount; projectedAll += f.amount }

  const inMonth = input.today?.slice(0, 7) === month
  const elapsed = inMonth ? Number(input.today!.slice(8, 10)) / daysIn(month) : null

  const children = new Map<number, Category[]>()
  for (const c of cats) {
    if (c.parentId != null && byId.has(c.parentId)) {
      const list = children.get(c.parentId) ?? []
      list.push(c)
      children.set(c.parentId, list)
    }
  }

  function line(c: Category): BudgetLine {
    const kids = (children.get(c.id as number) ?? []).map(line)
    const own = acc.get(c.id as number) ?? emptyAcc()
    const breakdown = { ...own.breakdown }
    let projected = own.projected
    const ahead = new Map(own.ahead)
    for (const k of kids) {
      breakdown.oneOff += k.breakdown.oneOff
      breakdown.cardInstallments += k.breakdown.cardInstallments
      breakdown.loan += k.breakdown.loan
      breakdown.refunds += k.breakdown.refunds
      projected += k.projected
      for (const a of k.committedAhead) ahead.set(a.month, (ahead.get(a.month) ?? 0) + a.amount)
    }
    const spent = spentOf(breakdown)
    const { amount: limit, isOverride } = limitFor(c.id as number, month, plans, overrides)
    const status = statusOf(spent, limit)
    return {
      category: c, limit, isOverride, spent, breakdown,
      remaining: limit === null ? null : limit - spent,
      ratio: limit === null || limit === 0 ? null : spent / limit,
      status,
      pace: limit !== null && elapsed !== null
        ? { expected: Math.round(limit * elapsed), ahead: status === 'ok' && spent > Math.round(limit * elapsed) }
        : null,
      projected,
      projectedStatus: statusOf(spent + projected, limit),
      committedAhead: [...ahead].map(([m, amount]) => ({ month: m, amount })).sort((a, b) => a.month.localeCompare(b.month)),
      children: kids,
    }
  }

  const tops = cats.filter(c => c.parentId == null || !byId.has(c.parentId)).map(line)

  // Totals: a top line with a limit covers itself; otherwise its limited children count on their own
  let budgeted = 0
  let budgetedSpent = 0
  for (const t of tops) {
    if (t.limit !== null) { budgeted += t.limit; budgetedSpent += t.spent; continue }
    for (const k of t.children) if (k.limit !== null) { budgeted += k.limit; budgetedSpent += k.spent }
  }

  const all = tops.flatMap(t => [t, ...t.children])
  const alerts = all
    .filter(l => l.status === 'warning' || l.status === 'over')
    .sort((a, b) => RANK[b.status] - RANK[a.status] || (b.ratio ?? 0) - (a.ratio ?? 0))

  const relevant = (l: BudgetLine) => l.limit !== null || l.spent !== 0 || l.projected > 0
  const order = (a: BudgetLine, b: BudgetLine) =>
    Number(b.limit !== null) - Number(a.limit !== null) || RANK[b.status] - RANK[a.status] || b.spent - a.spent
  const lines = tops
    .filter(l => relevant(l) || l.children.some(relevant))
    .map(l => ({ ...l, children: l.children.filter(relevant).sort(order) }))
    .sort(order)

  return {
    month, lines, alerts,
    hasBudgets: all.some(l => l.limit !== null),
    totals: {
      budgeted, budgetedSpent, remaining: budgeted - budgetedSpent,
      unbudgetedSpent: spentAll - budgetedSpent, spent: spentAll, projected: projectedAll,
    },
  }
}
