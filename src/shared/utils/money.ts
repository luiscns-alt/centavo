/**
 * Money is always integer centavos. These only format and parse — never do arithmetic on
 * floats (see core/decimal.ts for rates).
 */

import { css } from '../../../styled-system/css'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MINUS = '−' // U+2212, the same width as "+" in tabular numbers

/** 1250 → "R$ 12,50" */
export const formatBRL = (centavos: number): string => brl.format(centavos / 100)

/** A balance: minus only when negative — −500 → "−R$ 5,00", 500 → "R$ 5,00" */
export const formatBalance = (centavos: number): string =>
  centavos < 0 ? `${MINUS}${formatBRL(-centavos)}` : formatBRL(centavos)

/** A change or result: always signed — "+R$ 5,00", "−R$ 5,00", "R$ 0,00" */
export const formatDelta = (centavos: number): string =>
  `${centavos > 0 ? '+' : centavos < 0 ? MINUS : ''}${formatBRL(Math.abs(centavos))}`

/** Without "R$" (tables that state the currency once) — 123456 → "1.234,56" */
export const formatAmount = (centavos: number): string => plain.format(centavos / 100)

/** Signed, without "R$" — "+1.234,56" */
export const formatAmountDelta = (centavos: number): string =>
  `${centavos > 0 ? '+' : centavos < 0 ? MINUS : ''}${formatAmount(Math.abs(centavos))}`

const TONE = { income: css({ color: 'income' }), expense: css({ color: 'expense' }), muted: css({ color: 'muted' }) }

/** Text color class for a signed amount: income green, expense vinho, zero muted */
export const toneClass = (centavos: number): string =>
  centavos > 0 ? TONE.income : centavos < 0 ? TONE.expense : TONE.muted

/**
 * Parse a user-typed amount into integer centavos, or null if invalid.
 * Accepts pt-BR ("1.234,56") and en ("1,234.56", "12.50") styles, since mobile
 * decimal keyboards may show either separator. A lone dot followed by exactly
 * three digits ("1.500") is read as a thousands separator, per pt-BR.
 */
export function parseBRL(raw: string): number | null {
  const s = raw.trim().replace(/^R\$\s*/, '')
  if (s === '') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decimalSep: ',' | '.' | null
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? ',' : '.'
  } else if (lastComma >= 0) {
    decimalSep = ','
  } else if (lastDot >= 0) {
    const singleDot = s.indexOf('.') === lastDot
    decimalSep = singleDot && !/^\d{1,3}\.\d{3}$/.test(s) ? '.' : null
  } else {
    decimalSep = null
  }

  const sepIndex = decimalSep ? s.lastIndexOf(decimalSep) : -1
  const intPart = sepIndex >= 0 ? s.slice(0, sepIndex) : s
  const fracPart = sepIndex >= 0 ? s.slice(sepIndex + 1) : ''

  const thousandsSep = decimalSep === ',' ? '.' : decimalSep === '.' ? ',' : '.'
  const grouped = new RegExp(`^\\d{1,3}(\\${thousandsSep}\\d{3})+$`)
  if (!/^\d+$/.test(intPart) && !grouped.test(intPart)) return null
  if (sepIndex >= 0 && !/^\d{1,2}$/.test(fracPart)) return null

  const reais = Number(intPart.replaceAll(thousandsSep, ''))
  const centavos = Number(fracPart.padEnd(2, '0') || '0')
  return reais * 100 + centavos
}
