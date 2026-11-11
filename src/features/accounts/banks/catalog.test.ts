import { describe, it, expect } from 'vitest'
import { BANKS, bankById, exactBank, normalizeBankText, searchBanks } from './catalog'

describe('catalog', () => {
  it('has unique ids and COMPE codes', () => {
    const ids = BANKS.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    const codes = BANKS.map(b => b.compe).filter(Boolean)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('only points logos at local files', () => {
    for (const b of BANKS) if (b.logo) expect(b.logo).toMatch(/^\/banks\/[a-z0-9-]+\.svg$/)
  })

  it('looks banks up by id', () => {
    expect(bankById('nubank')?.name).toBe('Nubank')
    expect(bankById('nope')).toBeUndefined()
    expect(bankById(undefined)).toBeUndefined()
  })
})

describe('normalizeBankText', () => {
  it('drops accents, punctuation, case and filler words', () => {
    expect(normalizeBankText('  Itaú Unibanco S.A. ')).toBe('itau unibanco')
    expect(normalizeBankText('Banco do Brasil')).toBe('brasil')
    expect(normalizeBankText('CAIXA Econômica')).toBe('caixa economica')
  })

  it('keeps a query made only of filler words', () => {
    expect(normalizeBankText('Banco')).toBe('banco')
  })
})

describe('exactBank', () => {
  it.each([
    ['nubank', 'nubank'],
    ['Nu Pagamentos S.A.', 'nubank'],
    ['BB', 'banco-do-brasil'],
    ['banco do brasil', 'banco-do-brasil'],
    ['itau', 'itau'],
    ['Itaú', 'itau'],
    ['CEF', 'caixa'],
    ['PagSeguro', 'pagbank'],
  ])('%s → %s', (text, id) => {
    expect(exactBank(text)?.id).toBe(id)
  })

  it('does not guess on partial or unknown names', () => {
    expect(exactBank('Nuba')).toBeUndefined()
    expect(exactBank('Cooperativa Vale do Sol')).toBeUndefined()
    expect(exactBank('')).toBeUndefined()
  })
})

describe('searchBanks', () => {
  it('finds by prefix, accents optional', () => {
    expect(searchBanks('ita')[0].id).toBe('itau')
    expect(searchBanks('itaú')[0].id).toBe('itau')
  })

  it('finds by COMPE code, with or without leading zeros', () => {
    expect(searchBanks('260')[0].id).toBe('nubank')
    expect(searchBanks('1')[0].id).toBe('banco-do-brasil')
    expect(searchBanks('001')[0].id).toBe('banco-do-brasil')
  })

  it('ranks exact alias above prefix matches', () => {
    expect(searchBanks('pan')[0].id).toBe('pan')
    expect(searchBanks('inter')[0].id).toBe('inter')
  })

  it('reaches "Banco …" names while the user is still typing "ba"', () => {
    const ids = searchBanks('ba', 5).map(b => b.id)
    expect(ids).toContain('banco-do-brasil')
    expect(ids.slice(0, 4)).toEqual(['banco-do-brasil', 'banco-do-nordeste', 'original', 'pan'])
  })

  it('matches words inside multi-word names', () => {
    expect(searchBanks('pactual').map(b => b.id)).toContain('btg-pactual')
    expect(searchBanks('pago').map(b => b.id)).toContain('mercado-pago')
  })

  it('returns nothing for empty or unknown text, and respects the limit', () => {
    expect(searchBanks('')).toEqual([])
    expect(searchBanks('zzzz')).toEqual([])
    expect(searchBanks('b', 3).length).toBe(3)
  })
})
