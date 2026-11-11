/**
 * Calendar helpers on plain strings — YYYY-MM-DD (day) and YYYY-MM (month key) — in local
 * calendar terms. No Date ↔ UTC round-trips, so no timezone drift (Brazil is UTC−3).
 */

export const MONTH_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const
export const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

/** Year and month (1–12) */
export interface YM { year: number; month: number }

const pad = (n: number) => String(n).padStart(2, '0')

// ── Today ────────────────────────────────────────────────────────────────

/** A Date as YYYY-MM-DD in local time */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today as YYYY-MM-DD in local time — toISOString() would return the UTC date (tomorrow after 21h in BRT) */
export const todayISO = (): string => toISODate(new Date())

// ── Validation ───────────────────────────────────────────────────────────

/** YYYY-MM-DD that is also a real calendar date */
export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** YYYY-MM with a real month */
export const isMonthKey = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)

// ── Month keys ───────────────────────────────────────────────────────────

/** (2026, 3) → "2026-03" */
export const monthKey = (year: number, month: number): string => `${year}-${pad(month)}`
export const ymKey = ({ year, month }: YM): string => monthKey(year, month)
/** "2026-03…" → { year: 2026, month: 3 } (accepts a day too) */
export const parseYM = (key: string): YM => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) })

export function addMonths({ year, month }: YM, n: number): YM {
  const i = year * 12 + (month - 1) + n
  return { year: Math.floor(i / 12), month: (i % 12) + 1 }
}

/** "2026-11" + 2 → "2027-01" */
export const addMonthsKey = (key: string, n: number): string => ymKey(addMonths(parseYM(key), n))

/** The `n` months ending at (endYear, endMonth), oldest first */
export function monthWindow(endYear: number, endMonth: number, n: number): YM[] {
  const out: YM[] = []
  const endIndex = endYear * 12 + (endMonth - 1)
  for (let i = endIndex - n + 1; i <= endIndex; i++) out.push({ year: Math.floor(i / 12), month: (i % 12) + 1 })
  return out
}

export const daysInMonth = ({ year, month }: YM): number => new Date(year, month, 0).getDate()

/** "2026-02" → "2026-02-28" */
export const lastDayOfMonth = (key: string): string => `${key.slice(0, 7)}-${pad(daysInMonth(parseYM(key)))}`

/** The given day in that month, clamped to its last day — "dia 31" in February is the 28th/29th */
export const dayIn = (ym: YM, day: number): string => `${ymKey(ym)}-${pad(Math.min(day, daysInMonth(ym)))}`

/** First and last day of a month as YYYY-MM-DD */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  return { start: `${monthKey(year, month)}-01`, end: lastDayOfMonth(monthKey(year, month)) }
}

/** Whole days from a to b (YYYY-MM-DD), negative when b is earlier */
export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

// ── Formatting (pt-BR) ───────────────────────────────────────────────────

const monthIndex = (iso: string) => Number(iso.slice(5, 7)) - 1

/** "2026-11-13" → "13 nov" */
export const formatDayMonth = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTH_SHORT[monthIndex(iso)]}`
/** "2026-11-13" → "13/11" */
export const formatDayMonthNumeric = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
/** "2026-11-13" → "13/11/26" */
export const formatShortDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`
/** "2026-11" or a day → "novembro" */
export const formatMonthName = (key: string): string => MONTH_LONG[monthIndex(key)]
/** "2026-11" → "novembro 2026" */
export const formatMonthYear = (key: string): string => `${MONTH_LONG[monthIndex(key)]} ${key.slice(0, 4)}`
/** "2026-11" → "nov/26" */
export const formatMonthShort = (key: string): string => `${MONTH_SHORT[monthIndex(key)]}/${key.slice(2, 4)}`
/** "2026-11" → "nov/2026" */
export const formatMonthShortYear = (key: string): string => `${MONTH_SHORT[monthIndex(key)]}/${key.slice(0, 4)}`
/** "2026-11-13" → "13/11/2026" */
export const formatDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
/** "2026-11" → "nov" */
export const formatMonthAbbr = (key: string): string => MONTH_SHORT[monthIndex(key)]
