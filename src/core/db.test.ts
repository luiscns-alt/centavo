import { describe, it, expect, vi } from 'vitest'
import { formatBRL, todayISO, monthBounds, parseBRL } from './db'

describe('formatBRL', () => {
  it('formats positive centavos', () => {
    expect(formatBRL(1250)).toBe('R$\u00a012,50')
  })

  it('formats zero', () => {
    expect(formatBRL(0)).toBe('R$\u00a00,00')
  })

  it('formats negative centavos', () => {
    expect(formatBRL(-50)).toBe('-R$\u00a00,50')
  })

  it('formats large value', () => {
    expect(formatBRL(500000)).toBe('R$\u00a05.000,00')
  })
})

describe('todayISO', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // vite.config.ts pins TZ=America/Sao_Paulo for tests
  it('returns the local date late at night, not the UTC date', () => {
    vi.useFakeTimers()
    try {
      const lateNight = new Date('2026-10-31T23:30:00-03:00') // 02:30 UTC on Nov 1
      vi.setSystemTime(lateNight)
      expect(lateNight.getTimezoneOffset()).toBe(180)
      expect(todayISO()).toBe('2026-10-31')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('parseBRL', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['0,99', 99],
    ['1.234,56', 123456],
    ['1.000.000', 100000000],
    ['R$ 12,50', 1250],
    ['  7,00 ', 700],
    // en-style input from mobile decimal keyboards
    ['12.50', 1250],
    ['1.5', 150],
    ['1,234.56', 123456],
    // lone dot + 3 digits is pt-BR thousands
    ['1.500', 150000],
  ])('parses %j as %i centavos', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  it.each(['', 'abc', '12,5,3', '12,345', '1.23.45', '12,', ',50', '1.2345,00', '-5'])(
    'rejects %j',
    input => {
      expect(parseBRL(input)).toBeNull()
    },
  )
})

describe('monthBounds', () => {
  it('returns correct bounds for April (30 days)', () => {
    expect(monthBounds(2024, 4)).toEqual({ start: '2024-04-01', end: '2024-04-30' })
  })

  it('returns correct bounds for January (31 days)', () => {
    expect(monthBounds(2024, 1)).toEqual({ start: '2024-01-01', end: '2024-01-31' })
  })

  it('returns correct bounds for December', () => {
    expect(monthBounds(2024, 12)).toEqual({ start: '2024-12-01', end: '2024-12-31' })
  })

  it('handles February in a non-leap year', () => {
    expect(monthBounds(2023, 2)).toEqual({ start: '2023-02-01', end: '2023-02-28' })
  })

  it('handles February in a leap year', () => {
    expect(monthBounds(2024, 2)).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })
})
