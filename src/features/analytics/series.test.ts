import { describe, it, expect } from 'vitest'
import { buildMonthlySeries, carryInto, monthDiff } from './series'
import { monthWindow } from '../../shared/utils/dates'

const tx = (date: string, type: 'income' | 'expense', amount: number) => ({ date, type, amount })

describe('monthWindow', () => {
  it('returns n months ending at the given month, oldest first', () => {
    expect(monthWindow(2026, 3, 3)).toEqual([
      { year: 2026, month: 1 }, { year: 2026, month: 2 }, { year: 2026, month: 3 },
    ])
  })

  it('crosses the year boundary', () => {
    expect(monthWindow(2026, 2, 4)).toEqual([
      { year: 2025, month: 11 }, { year: 2025, month: 12 }, { year: 2026, month: 1 }, { year: 2026, month: 2 },
    ])
  })
})

describe('monthDiff', () => {
  it('counts months across years', () => {
    expect(monthDiff({ year: 2025, month: 11 }, { year: 2026, month: 2 })).toBe(3)
    expect(monthDiff({ year: 2026, month: 2 }, { year: 2025, month: 11 })).toBe(-3)
  })
})

describe('buildMonthlySeries', () => {
  it('sums income, expense and net per month', () => {
    const s = buildMonthlySeries([
      tx('2026-10-01', 'income', 500000),
      tx('2026-10-15', 'expense', 120000),
      tx('2026-10-31', 'expense', 30000),
      tx('2026-11-01', 'income', 100000),
    ], 2026, 11, 2)
    expect(s.map(p => [p.key, p.income, p.expense, p.net])).toEqual([
      ['2026-10', 500000, 150000, 350000],
      ['2026-11', 100000, 0, 100000],
    ])
  })

  it('accumulates the balance month over month', () => {
    const s = buildMonthlySeries([
      tx('2026-09-10', 'income', 1000),
      tx('2026-10-10', 'expense', 3000),
      tx('2026-11-10', 'income', 500),
    ], 2026, 11, 3)
    expect(s.map(p => p.cumulative)).toEqual([1000, -2000, -1500])
  })

  it('opens the window with the balance of everything before it', () => {
    const s = buildMonthlySeries([
      tx('2024-01-05', 'income', 10000),
      tx('2026-05-05', 'expense', 2500),
      tx('2026-11-05', 'expense', 1000),
    ], 2026, 11, 2)
    expect(s.map(p => p.cumulative)).toEqual([7500, 6500])
    expect(s[0].hasData).toBe(false)
    expect(s[0].net).toBe(0)
  })

  it('ignores transactions after the window', () => {
    const s = buildMonthlySeries([
      tx('2026-11-30', 'income', 100),
      tx('2026-12-01', 'income', 99999),
    ], 2026, 11, 1)
    expect(s[0].income).toBe(100)
    expect(s[0].cumulative).toBe(100)
  })

  it('keeps empty months in the window', () => {
    const s = buildMonthlySeries([tx('2026-01-31', 'expense', 700)], 2026, 3, 3)
    expect(s.map(p => p.hasData)).toEqual([true, false, false])
    expect(s.map(p => p.cumulative)).toEqual([-700, -700, -700])
  })

  it('places last-day and first-day transactions in the right month across the year boundary', () => {
    const s = buildMonthlySeries([
      tx('2025-12-31', 'expense', 200),
      tx('2026-01-01', 'income', 300),
    ], 2026, 1, 2)
    expect(s.map(p => [p.key, p.net])).toEqual([['2025-12', -200], ['2026-01', 300]])
  })
})

describe('buildMonthlySeries with card installments', () => {
  it('counts income/expense in the report month, but moves the balance on the purchase date', () => {
    // R$ 300 bought on Nov 12 in 3×, invoices Dec/Jan/Feb
    const s = buildMonthlySeries([
      { date: '2026-11-12', month: '2026-12', type: 'expense', amount: 100 },
      { date: '2026-11-12', month: '2027-01', type: 'expense', amount: 100 },
      { date: '2026-11-12', month: '2027-02', type: 'expense', amount: 100 },
    ], 2027, 1, 3)
    expect(s.map(p => [p.key, p.expense, p.cumulative])).toEqual([
      ['2026-11', 0, -300],   // the whole debt exists from the purchase
      ['2026-12', 100, -300], // but only one installment is a December expense
      ['2027-01', 100, -300],
    ])
  })
})

describe('carryInto', () => {
  const tx = (month: string, type: 'income' | 'expense' | 'refund', amount: number) => ({ month, type, amount })

  it('November surplus of R$ 1.000 makes a R$ 1.000-short December close at zero', () => {
    const txs = [tx('2026-11', 'income', 500_000), tx('2026-11', 'expense', 400_000), tx('2026-12', 'income', 500_000), tx('2026-12', 'expense', 600_000)]
    const carry = carryInto('2026-12', txs, [])
    expect(carry).toBe(100_000)
    expect(carry + (500_000 - 600_000)).toBe(0)
  })

  it('starts from the opening balances; refunds give back; later months and dates are ignored', () => {
    const txs = [tx('2026-10', 'expense', 30_000), tx('2026-10', 'refund', 5_000), tx('2026-12', 'income', 999_999)]
    const openings = [{ amount: 200_000, date: '2026-09-15' }, { amount: 70_000, date: '2026-12-01' }]
    expect(carryInto('2026-11', txs, openings)).toBe(200_000 - 30_000 + 5_000)
  })
})
