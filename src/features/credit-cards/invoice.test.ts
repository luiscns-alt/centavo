import { describe, it, expect } from 'vitest'
import { addMonthsKey, dayIn, invoiceDates, invoiceFor, invoiceStatus, splitInstallments } from './invoice'

describe('invoiceFor — fecha dia 3, vence dia 10', () => {
  it.each([
    ['2026-11-02', '2026-11', '2026-11-03', '2026-11-10'], // before closing → this month
    ['2026-11-03', '2026-12', '2026-12-03', '2026-12-10'], // ON the closing day → next invoice
    ['2026-11-12', '2026-12', '2026-12-03', '2026-12-10'],
    ['2026-12-31', '2027-01', '2027-01-03', '2027-01-10'], // year boundary
  ])('compra em %s → fatura %s (fecha %s, vence %s)', (date, inv, closing, due) => {
    expect(invoiceFor(date, 3, 10)).toEqual({ invoiceMonth: inv, closingDate: closing, dueDate: due })
  })
})

describe('invoiceFor — vence antes de fechar (fecha 25, vence 5)', () => {
  it.each([
    ['2026-11-24', '2026-12', '2026-11-25', '2026-12-05'],
    ['2026-11-25', '2027-01', '2026-12-25', '2027-01-05'],
    ['2026-12-26', '2027-02', '2027-01-25', '2027-02-05'],
  ])('compra em %s → fatura %s', (date, inv, closing, due) => {
    expect(invoiceFor(date, 25, 5)).toEqual({ invoiceMonth: inv, closingDate: closing, dueDate: due })
  })
})

describe('end-of-month days clamp', () => {
  it('day 31 is the last day in short months', () => {
    expect(dayIn({ year: 2026, month: 2 }, 31)).toBe('2026-02-28')
    expect(dayIn({ year: 2028, month: 2 }, 30)).toBe('2028-02-29')
    expect(dayIn({ year: 2026, month: 4 }, 31)).toBe('2026-04-30')
  })

  it('closing on the 31st: a purchase on Feb 28 is ON the clamped closing day → next invoice', () => {
    const r = invoiceFor('2026-02-28', 31, 8)
    expect(r).toEqual({ invoiceMonth: '2026-04', closingDate: '2026-03-31', dueDate: '2026-04-08' })
    expect(invoiceFor('2026-02-27', 31, 8).invoiceMonth).toBe('2026-03')
  })

  it('invoiceDates is the inverse view of an invoice name', () => {
    expect(invoiceDates('2027-03', 3, 10)).toEqual({ invoiceMonth: '2027-03', closingDate: '2027-03-03', dueDate: '2027-03-10' })
    expect(invoiceDates('2027-03', 25, 5)).toEqual({ invoiceMonth: '2027-03', closingDate: '2027-02-25', dueDate: '2027-03-05' })
  })

  it('every purchase date maps to an invoice whose closing comes after it', () => {
    for (const [c, d] of [[1, 8], [3, 10], [15, 22], [25, 5], [28, 7], [31, 10], [10, 10]]) {
      for (let day = 1; day <= 60; day++) {
        const dt = new Date(2026, 0, day)
        const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        const r = invoiceFor(iso, c, d)
        expect(r.closingDate > iso).toBe(true)
        expect(r.dueDate > r.closingDate).toBe(true)
        expect(r.dueDate.slice(0, 7)).toBe(r.invoiceMonth)
      }
    }
  })
})

describe('splitInstallments', () => {
  it('first installment absorbs the remainder', () => {
    expect(splitInstallments(100000, 3)).toEqual([33334, 33333, 33333])
    expect(splitInstallments(1000, 1)).toEqual([1000])
    expect(splitInstallments(5, 3)).toEqual([3, 1, 1])
  })

  it('always sums exactly to the total', () => {
    for (let total = 1; total < 5000; total += 37) {
      for (let n = 1; n <= 24; n++) {
        const parts = splitInstallments(total * 101, n)
        expect(parts.reduce((s, x) => s + x, 0)).toBe(total * 101)
        expect(parts.length).toBe(n)
      }
    }
  })
})

describe('addMonthsKey', () => {
  it('crosses years', () => {
    expect(addMonthsKey('2026-12', 1)).toBe('2027-01')
    expect(addMonthsKey('2026-12', 23)).toBe('2028-11')
    expect(addMonthsKey('2027-01', -1)).toBe('2026-12')
  })
})

describe('invoiceStatus', () => {
  const ref = invoiceDates('2026-12', 3, 10) // closes 12-03, due 12-10
  it.each([
    ['open',    10000, 0,     '2026-11-20', '2026-12'],
    ['closed',  10000, 0,     '2026-12-05', '2027-01'],
    ['partial', 10000, 4000,  '2026-12-05', '2027-01'],
    ['paid',    10000, 10000, '2026-12-05', '2027-01'],
    ['overdue', 10000, 4000,  '2026-12-11', '2027-01'],
    ['future',  10000, 0,     '2026-10-20', '2026-11'],
    ['empty',   0,     0,     '2026-11-20', '2026-12'],
  ])('%s', (status, total, paid, today, current) => {
    expect(invoiceStatus(ref, total, paid, today, current)).toBe(status)
  })
})
