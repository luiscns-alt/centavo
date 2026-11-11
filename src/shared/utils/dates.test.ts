import { describe, it, expect } from 'vitest'
import { addMonthsKey, dayIn, daysBetween, formatDate, formatDayMonth, formatDayMonthNumeric, formatMonthAbbr, formatMonthName, formatMonthShort, formatMonthShortYear, formatMonthYear, formatShortDate, isISODate, isMonthKey, lastDayOfMonth, monthBounds, monthWindow } from './dates'

describe('dates', () => {
  it('month arithmetic across years and short months', () => {
    expect(addMonthsKey('2026-11', 2)).toBe('2027-01')
    expect(addMonthsKey('2026-01', -1)).toBe('2025-12')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
    expect(dayIn({ year: 2026, month: 2 }, 31)).toBe('2026-02-28')
    expect(monthBounds(2026, 4)).toEqual({ start: '2026-04-01', end: '2026-04-30' })
    expect(monthWindow(2026, 2, 3).map(m => `${m.year}-${m.month}`)).toEqual(['2025-12', '2026-1', '2026-2'])
    expect(daysBetween('2026-11-10', '2026-11-13')).toBe(3)
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1)
  })

  it('validates real dates and month keys', () => {
    expect([isISODate('2026-02-29'), isISODate('2028-02-29'), isISODate('2026-13-01')]).toEqual([false, true, false])
    expect([isMonthKey('2026-12'), isMonthKey('2026-00'), isMonthKey(202612)]).toEqual([true, false, false])
  })

  it('formats in pt-BR', () => {
    expect(formatDayMonth('2026-11-03')).toBe('3 nov')
    expect(formatDayMonthNumeric('2026-11-03')).toBe('03/11')
    expect(formatShortDate('2026-11-03')).toBe('03/11/26')
    expect(formatDate('2026-11-03')).toBe('03/11/2026')
    expect(formatMonthName('2026-03')).toBe('março')
    expect(formatMonthYear('2026-03')).toBe('março 2026')
    expect(formatMonthShort('2026-03')).toBe('mar/26')
    expect(formatMonthShortYear('2026-03')).toBe('mar/2026')
    expect(formatMonthAbbr('2026-03-15')).toBe('mar')
  })
})
