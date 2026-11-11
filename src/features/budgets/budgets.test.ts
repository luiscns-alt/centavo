import { describe, it, expect } from 'vitest'
import { buildBudgetDashboard, crossed, limitFor, statusOf, type BudgetInput } from './budgets'
import type { BudgetOverride, BudgetPlan, Category } from '../../core/db'

const cat = (id: number, name: string, parentId?: number): Category =>
  ({ id, name, icon: '•', type: 'expense', ...(parentId ? { parentId } : {}) })
const plan = (categoryId: number, from: string, amount: number | null): BudgetPlan => ({ categoryId, from, amount, createdAt: 0 })
const CATS = [cat(1, 'Alimentação'), cat(2, 'Mercado', 1), cat(3, 'Delivery', 1), cat(4, 'Transporte'), cat(5, 'Lazer')]

describe('limits', () => {
  it('latest version ≤ month, override wins, null ends', () => {
    const plans = [plan(1, '2026-01', 100), plan(1, '2026-06', 200), plan(1, '2026-10', null)]
    const ov: BudgetOverride[] = [{ categoryId: 1, month: '2026-07', amount: 999 }]
    expect(limitFor(1, '2025-12', plans, ov).amount).toBeNull()
    expect(limitFor(1, '2026-03', plans, ov).amount).toBe(100)
    expect(limitFor(1, '2026-07', plans, ov)).toEqual({ amount: 999, isOverride: true })
    expect(limitFor(1, '2026-08', plans, ov).amount).toBe(200)
    expect(limitFor(1, '2026-11', plans, ov).amount).toBeNull()
  })

  it('status thresholds and crossings', () => {
    expect([statusOf(79, 100), statusOf(80, 100), statusOf(100, 100), statusOf(101, 100), statusOf(5, null)])
      .toEqual(['ok', 'warning', 'warning', 'over', 'none'])
    expect([crossed('ok', 'warning'), crossed('warning', 'over'), crossed('ok', 'over'), crossed('over', 'warning')])
      .toEqual(['warning', 'over', 'over', null])
  })
})

describe('dashboard', () => {
  const base = (over: Partial<BudgetInput> = {}): BudgetInput => ({
    month: '2026-11', categories: CATS,
    plans: [plan(1, '2026-01', 100_000), plan(3, '2026-01', 20_000), plan(4, '2026-01', 50_000)],
    overrides: [],
    transactions: [
      { type: 'expense', amount: 40_000, categoryId: 2 },
      { type: 'expense', amount: 25_000, categoryId: 3, purchaseId: 9 },
      { type: 'refund', amount: 5_000, categoryId: 3 },
      { type: 'expense', amount: 10_000, categoryId: 1 },
      { type: 'expense', amount: 30_000, categoryId: 4, loanEventId: 1 },
      { type: 'expense', amount: 7_000, categoryId: 5 },
      { type: 'income', amount: 500_000, categoryId: 99 },
    ],
    ...over,
  })

  it('rolls children up, keeps nested limits out of the totals', () => {
    const d = buildBudgetDashboard(base())
    const food = d.lines.find(l => l.category.id === 1)!
    expect(food.spent).toBe(40_000 + 25_000 - 5_000 + 10_000)
    expect(food.breakdown).toEqual({ oneOff: 50_000, cardInstallments: 25_000, loan: 0, refunds: 5_000 })
    expect(food.status).toBe('ok')
    const delivery = food.children.find(l => l.category.id === 3)!
    expect([delivery.spent, delivery.status, delivery.remaining]).toEqual([20_000, 'warning', 0])
    expect(d.totals).toMatchObject({ budgeted: 150_000, budgetedSpent: 70_000 + 30_000, unbudgetedSpent: 7_000, spent: 107_000 })
    expect(d.totals.budgetedSpent + d.totals.unbudgetedSpent).toBe(d.totals.spent)
    expect(d.alerts.map(a => a.category.name)).toEqual(['Delivery'])
  })

  it('a parent without limit leaves its limited children counting on their own', () => {
    const d = buildBudgetDashboard(base({ plans: [plan(3, '2026-01', 10_000)] }))
    expect(d.totals).toMatchObject({ budgeted: 10_000, budgetedSpent: 20_000, unbudgetedSpent: 87_000 })
    expect(d.alerts[0]).toMatchObject({ status: 'over', remaining: -10_000 })
  })

  it('pace, forecast and committed installments', () => {
    const d = buildBudgetDashboard(base({
      today: '2026-11-15',
      forecast: [{ categoryId: 4, amount: 25_000 }],
      future: [
        { type: 'expense', amount: 25_000, categoryId: 3, month: '2026-12' },
        { type: 'expense', amount: 25_000, categoryId: 3, month: '2027-01' },
        { type: 'expense', amount: 25_000, categoryId: 3, month: '2027-06' },
      ],
    }))
    const transp = d.lines.find(l => l.category.id === 4)!
    expect(transp.pace).toEqual({ expected: 25_000, ahead: true })
    expect([transp.projected, transp.projectedStatus]).toEqual([25_000, 'over'])
    expect(d.lines.find(l => l.category.id === 1)!.committedAhead).toEqual([
      { month: '2026-12', amount: 25_000 }, { month: '2027-01', amount: 25_000 },
    ])
    expect(buildBudgetDashboard(base({ today: '2026-12-01' })).lines[0].pace).toBeNull()
  })

  it('100k transactions in well under 50 ms', () => {
    const transactions = Array.from({ length: 100_000 }, (_, i) => ({
      type: (i % 17 === 0 ? 'refund' : 'expense') as 'expense' | 'refund', amount: 100 + (i % 900), categoryId: 1 + (i % 5),
      ...(i % 3 === 0 ? { purchaseId: i } : {}),
    }))
    buildBudgetDashboard(base({ transactions })) // warm up
    const t0 = performance.now()
    const d = buildBudgetDashboard(base({ transactions }))
    const ms = performance.now() - t0
    expect(d.totals.budgetedSpent + d.totals.unbudgetedSpent).toBe(d.totals.spent)
    expect(ms).toBeLessThan(50)
  })
})
