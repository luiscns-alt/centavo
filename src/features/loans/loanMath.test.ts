import { describe, it, expect } from 'vitest'
import { dec, div, format, fromInt, mul, nthRoot, powInt, toNumber } from '../../core/decimal'
import {
  adjustBalance, dueDateOf, initialState, monthlyRate, monthlyRatePercent, nextInstallment, originalSchedule,
  payoffAmount, prepayment, pricePayment, proRataInterest, project, type LoanTerms,
} from './loanMath'

const terms = (over: Partial<LoanTerms> = {}): LoanTerms => ({
  principal: 10_000_000, rate: { value: '1', unit: 'monthly' }, termMonths: 12, system: 'price',
  startDate: '2026-01-10', firstDueDate: '2026-02-10', ...over,
})
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

describe('decimal', () => {
  it('parses, multiplies and divides exactly', () => {
    expect(format(mul(dec('0,7974'), fromInt(3)), 4)).toBe('2.3922')
    expect(format(div(fromInt(1), fromInt(3)), 6)).toBe('0.333333')
    expect(() => dec('1,2,3')).toThrow()
  })

  it('powers and roots invert each other', () => {
    const x = dec('1.0099')
    expect(format(nthRoot(powInt(x, 12), 12), 20)).toBe('1.00990000000000000000')
    expect(format(nthRoot(fromInt(2), 2), 12)).toBe('1.414213562373')
  })
})

describe('rates', () => {
  it('converts annual to monthly by compound equivalence', () => {
    // 1.01^12 = 1.126825030131969720661201
    expect(format(monthlyRate({ value: '12.6825030131969720661201', unit: 'annual' }), 12)).toBe('0.010000000000')
    expect(monthlyRatePercent({ value: '9,99', unit: 'annual' })).toBe('0.7967')
  })

  it('pro-rata interest is exact for a full period and smaller for fewer days', () => {
    const i = monthlyRate({ value: '1', unit: 'monthly' })
    expect(proRataInterest(10_000_000, i, 30)).toBe(100_000)
    expect(proRataInterest(10_000_000, i, 15)).toBe(49_876) // 1.01^(1/2) − 1 = 0.4987562%
    expect(proRataInterest(10_000_000, i, 0)).toBe(0)
  })
})

describe('Price — R$ 100.000 a 1% a.m. em 12 meses', () => {
  const s = originalSchedule(terms())

  it('matches the reference payment of R$ 8.884,88', () => {
    expect(pricePayment(10_000_000, monthlyRate({ value: '1', unit: 'monthly' }), 12)).toBe(888_488)
    expect(s.slice(0, 11).every(x => x.interest + x.principal === 888_488)).toBe(true)
  })

  it('first installment: R$ 1.000,00 of interest, R$ 7.884,88 of amortization', () => {
    expect([s[0].interest, s[0].principal, s[0].balanceAfter]).toEqual([100_000, 788_488, 9_211_512])
  })

  it('amortizes exactly the principal and ends at zero', () => {
    expect(s).toHaveLength(12)
    expect(sum(s.map(x => x.principal))).toBe(10_000_000)
    expect(s[11].balanceAfter).toBe(0)
  })
})

describe('SAC — R$ 100.000 a 1% a.m. em 12 meses', () => {
  const s = originalSchedule(terms({ system: 'sac' }))

  it('constant amortization, decreasing installments, reference first installment R$ 9.333,33', () => {
    expect(s[0].interest + s[0].principal).toBe(933_333)
    expect(s.slice(0, 11).every(x => x.principal === 833_333)).toBe(true)
    for (let k = 1; k < 12; k++) expect(s[k].interest + s[k].principal).toBeLessThanOrEqual(s[k - 1].interest + s[k - 1].principal + 4)
  })

  it('last installment absorbs the residue', () => {
    expect(s[11].principal).toBe(10_000_000 - 11 * 833_333)
    expect(s[11].balanceAfter).toBe(0)
  })
})

describe('properties over random contracts', () => {
  it('Σ amortization = principal, balance ends at 0, interest = round(B·i)', () => {
    let seed = 7
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n }
    for (let k = 0; k < 120; k++) {
      const t = terms({
        principal: 100_000 + rnd(500_000_000),
        rate: { value: `${rnd(3)}.${String(rnd(10000)).padStart(4, '0')}`, unit: rnd(2) ? 'monthly' : 'annual' },
        termMonths: 1 + rnd(360),
        system: rnd(2) ? 'price' : 'sac',
      })
      const s = originalSchedule(t)
      expect(s.length).toBe(t.termMonths)
      expect(sum(s.map(x => x.principal))).toBe(t.principal)
      expect(s[s.length - 1].balanceAfter).toBe(0)
      expect(s.every(x => x.principal >= 0 && x.interest >= 0)).toBe(true)
    }
  })
})

describe('30-year mortgage (360 months)', () => {
  const t = terms({ principal: 45_000_000, rate: { value: '9.99', unit: 'annual' }, termMonths: 360, system: 'sac', firstDueDate: '2026-03-10', startDate: '2026-02-10' })
  it('computes fast and closes at zero', () => {
    const t0 = performance.now()
    const s = originalSchedule(t)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(s).toHaveLength(360)
    expect(s[0].principal).toBe(125_000)
    expect(s[359].balanceAfter).toBe(0)
    expect(s[359].dueDate).toBe('2056-02-10')
  })
})

describe('due dates', () => {
  it('keeps the day and clamps short months', () => {
    expect(dueDateOf({ firstDueDate: '2026-01-31' }, 2)).toBe('2026-02-28')
    expect(dueDateOf({ firstDueDate: '2026-01-31' }, 3)).toBe('2026-03-31')
  })
})

describe('prepayment', () => {
  const t = terms({ principal: 10_000_000, termMonths: 24 })
  const afterTwo = () => {
    let s = initialState(t)
    s = nextInstallment(t, s).state
    s = nextInstallment(t, s).state
    return s
  }

  it('pays pro-rata interest first, then amortizes', () => {
    const s = afterTwo() // period 3 runs 2026-03-10 → 2026-04-10
    const p = prepayment(t, s, '2026-03-25', 1_000_000, 'reduce-term')
    expect(p.interest).toBe(proRataInterest(s.balance, monthlyRate(t.rate), 15))
    expect(p.principal).toBe(1_000_000 - p.interest)
    expect(p.state.balance).toBe(s.balance - p.principal)
    expect(p.state.accruedDays).toBe(15)
    // the next installment only charges the remaining 15 days
    const next = nextInstallment(t, p.state).inst
    expect(next.interest).toBe(proRataInterest(p.state.balance, monthlyRate(t.rate), 15))
  })

  it('reduce-term keeps the payment and shortens the schedule; reduce-payment keeps the term', () => {
    const s = afterTwo()
    const term = prepayment(t, s, '2026-03-10', 3_000_000, 'reduce-term')
    const pay = prepayment(t, s, '2026-03-10', 3_000_000, 'reduce-payment')
    const a = project(t, term.state)
    const b = project(t, pay.state)
    expect(a.length).toBeLessThan(22)
    expect(a[0].interest + a[0].principal).toBe(s.payment)
    expect(b).toHaveLength(22)
    expect(b[0].interest + b[0].principal).toBeLessThan(s.payment)
    // both close at zero and amortize exactly what was left
    for (const sched of [a, b]) {
      expect(sched[sched.length - 1].balanceAfter).toBe(0)
      expect(sum(sched.map(x => x.principal))).toBe(term.state.balance)
    }
    // reducing the term saves more interest than reducing the payment
    expect(sum(a.map(x => x.interest))).toBeLessThan(sum(b.map(x => x.interest)))
  })

  it('SAC reduce-term keeps the amortization', () => {
    const ts = terms({ system: 'sac', termMonths: 24 })
    let s = initialState(ts)
    s = nextInstallment(ts, s).state
    const p = prepayment(ts, s, '2026-02-10', 2_000_000, 'reduce-term')
    expect(p.state.amortization).toBe(s.amortization)
    expect(p.state.remaining).toBe(Math.ceil(p.state.balance / s.amortization))
  })

  it('pays off exactly, and refuses more than the payoff amount', () => {
    const s = afterTwo()
    const max = payoffAmount(t, s, '2026-03-20')
    const p = prepayment(t, s, '2026-03-20', max, 'reduce-term')
    expect(p.payoff).toBe(true)
    expect(p.state.balance).toBe(0)
    expect(() => prepayment(t, s, '2026-03-20', max + 1, 'reduce-term')).toThrow()
  })
})

describe('adjustBalance', () => {
  it('keeps the term and recomputes the payment', () => {
    const t = terms({ termMonths: 24 })
    const s = nextInstallment(t, initialState(t)).state
    const adj = adjustBalance(t, s, s.balance - 1234)
    const sched = project(t, adj)
    expect(sched).toHaveLength(23)
    expect(sched[22].balanceAfter).toBe(0)
  })
})

describe('float sanity', () => {
  it('matches the float formula to the centavo for a 360-month Price', () => {
    const i = 0.0079676
    const P = 45_000_000
    const exact = pricePayment(P, monthlyRate({ value: '0.79676', unit: 'monthly' }), 360)
    expect(Math.abs(exact - (P * i) / (1 - Math.pow(1 + i, -360)))).toBeLessThan(1)
    expect(toNumber(monthlyRate({ value: '1', unit: 'monthly' }))).toBe(0.01)
  })
})
