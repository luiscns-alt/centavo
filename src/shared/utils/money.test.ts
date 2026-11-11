import { describe, it, expect } from 'vitest'
import { formatAmount, formatAmountDelta, formatBRL, formatBalance, formatDelta, toneClass } from './money'

// Intl uses a no-break space after "R$"
const n = (s: string) => s.replace(/\u00a0/g, ' ')

describe('money', () => {
  it('balances show a minus only when negative; deltas are always signed', () => {
    expect(n(formatBRL(123456))).toBe('R$ 1.234,56')
    expect(n(formatBalance(-500))).toBe('−R$ 5,00')
    expect(n(formatBalance(500))).toBe('R$ 5,00')
    expect([n(formatDelta(500)), n(formatDelta(-500)), n(formatDelta(0))]).toEqual(['+R$ 5,00', '−R$ 5,00', 'R$ 0,00'])
  })

  it('plain amounts and tone', () => {
    expect(formatAmount(123456)).toBe('1.234,56')
    expect(formatAmountDelta(-123456)).toBe('−1.234,56')
    expect([toneClass(1), toneClass(-1), toneClass(0)]).toEqual(['text-income', 'text-expense', 'text-muted'])
  })
})
