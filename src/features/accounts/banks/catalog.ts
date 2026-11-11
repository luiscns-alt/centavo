import type { AccountKind } from '../../../core/types'
/**
 * Known Brazilian banks for the account form. Logos are the banks' trademarks, shipped as
 * static files in /public/banks (from github.com/Tgentil/Bancos-em-SVG, which collects the
 * official artwork) and shown only to identify the user's own accounts. No network lookups:
 * the app works offline and never tells a third party which banks the user has.
 */

export interface Bank {
  /** Stable key stored in Account.bankId — never rename an existing id */
  id: string
  name: string
  /** COMPE code, also searchable ("260" → Nubank) */
  compe?: string
  /** Other names people type */
  aliases: string[]
  /** Path under /public; missing → the account's emoji is shown */
  logo?: string
  /** Suggested account type when picked */
  kind?: AccountKind
}

const logo = (id: string) => `/banks/${id}.svg`

export const BANKS: Bank[] = [
  { id: 'nubank',            name: 'Nubank',            compe: '260', aliases: ['nu', 'nu pagamentos', 'nu bank', 'roxinho'], logo: logo('nubank') },
  { id: 'itau',              name: 'Itaú',              compe: '341', aliases: ['itau unibanco', 'itau personnalite', 'personnalite', 'iti'], logo: logo('itau') },
  { id: 'bradesco',          name: 'Bradesco',          compe: '237', aliases: ['bradesco prime'], logo: logo('bradesco') },
  { id: 'banco-do-brasil',   name: 'Banco do Brasil',   compe: '001', aliases: ['bb', 'brasil'], logo: logo('banco-do-brasil') },
  { id: 'caixa',             name: 'Caixa',             compe: '104', aliases: ['caixa economica', 'caixa economica federal', 'cef'], logo: logo('caixa') },
  { id: 'santander',         name: 'Santander',         compe: '033', aliases: ['santander brasil'], logo: logo('santander') },
  { id: 'inter',             name: 'Inter',             compe: '077', aliases: ['banco inter'], logo: logo('inter') },
  { id: 'c6',                name: 'C6 Bank',           compe: '336', aliases: ['c6', 'c6bank'], logo: logo('c6') },
  { id: 'btg-pactual',       name: 'BTG Pactual',       compe: '208', aliases: ['btg', 'btg banking'], logo: logo('btg-pactual') },
  { id: 'xp',                name: 'XP Investimentos',  compe: '102', aliases: ['xp', 'banco xp'], logo: logo('xp'), kind: 'investment' },
  { id: 'rico',              name: 'Rico',              aliases: ['rico investimentos'], kind: 'investment' },
  { id: 'picpay',            name: 'PicPay',            compe: '380', aliases: ['pic pay'], logo: logo('picpay') },
  { id: 'mercado-pago',      name: 'Mercado Pago',      compe: '323', aliases: ['mercadopago', 'mercado livre'], logo: logo('mercado-pago') },
  { id: 'pagbank',           name: 'PagBank',           compe: '290', aliases: ['pagseguro', 'pag bank', 'pag seguro'], logo: logo('pagbank') },
  { id: 'neon',              name: 'Neon',              compe: '536', aliases: ['banco neon'], logo: logo('neon') },
  { id: 'next',              name: 'Next',              aliases: ['banco next'] },
  { id: 'sicoob',            name: 'Sicoob',            compe: '756', aliases: ['bancoob'], logo: logo('sicoob') },
  { id: 'sicredi',           name: 'Sicredi',           compe: '748', aliases: [], logo: logo('sicredi') },
  { id: 'banrisul',          name: 'Banrisul',          compe: '041', aliases: ['banco do estado do rio grande do sul'], logo: logo('banrisul') },
  { id: 'brb',               name: 'BRB',               compe: '070', aliases: ['banco de brasilia'], logo: logo('brb') },
  { id: 'safra',             name: 'Safra',             compe: '422', aliases: ['banco safra'], logo: logo('safra') },
  { id: 'pan',               name: 'Banco Pan',         compe: '623', aliases: ['pan', 'panamericano'], logo: logo('pan') },
  { id: 'will-bank',         name: 'Will Bank',         aliases: ['will', 'willbank'] },
  { id: 'banco-do-nordeste', name: 'Banco do Nordeste', compe: '004', aliases: ['bnb', 'nordeste'], logo: logo('banco-do-nordeste') },
  { id: 'original',          name: 'Banco Original',    compe: '212', aliases: ['original'], logo: logo('original') },
]

const BY_ID = new Map(BANKS.map(b => [b.id, b]))

export const bankById = (id: string | undefined | null): Bank | undefined => (id ? BY_ID.get(id) : undefined)

/** Words that don't identify a bank on their own */
const NOISE = new Set(['banco', 'bank', 's', 'a', 'sa', 'do', 'da', 'de', 'conta', 'corrente'])

/** Lower case, no accents, punctuation collapsed to single spaces */
function plainWords(text: string): string[] {
  return text
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** "Itaú Unibanco S.A." → "itau unibanco" — lower case, no accents, no punctuation or filler words */
export function normalizeBankText(text: string): string {
  const words = plainWords(text)
  const meaningful = words.filter(w => !NOISE.has(w))
  // "Banco do Brasil" → "brasil", but a query made only of filler ("banco") stays as typed
  return (meaningful.length ? meaningful : words).join(' ')
}

/** Normalized names a bank answers to (exact matching) */
const KEYS = new Map(BANKS.map(b => [b.id, [b.name, ...b.aliases].map(normalizeBankText)]))

/** Also the full names with filler words, so "ba…" still reaches "Banco do Brasil" while typing */
const SEARCH_KEYS = new Map(BANKS.map(b => [
  b.id,
  [...new Set([...KEYS.get(b.id)!, ...[b.name, ...b.aliases].map(n => plainWords(n).join(' '))])],
]))

/** Bank whose name or alias equals the text exactly (after normalization) */
export function exactBank(text: string): Bank | undefined {
  const q = normalizeBankText(text)
  if (!q) return undefined
  return BANKS.find(b => KEYS.get(b.id)!.includes(q))
}

/**
 * Up to `limit` banks for what the user is typing. Ranking: exact name/alias or COMPE code,
 * then a name/alias that starts with the text, then a word that starts with it, then "contains".
 */
export function searchBanks(text: string, limit = 5): Bank[] {
  const q = normalizeBankText(text)
  if (!q) return []
  const digits = /^\d{1,3}$/.test(q) ? q.padStart(3, '0') : null

  const scored: { bank: Bank; score: number }[] = []
  for (const bank of BANKS) {
    const keys = SEARCH_KEYS.get(bank.id)!
    let score = Infinity
    if (digits && bank.compe === digits) score = 0
    for (const k of keys) {
      if (k === q) score = Math.min(score, 0)
      else if (k.startsWith(q)) score = Math.min(score, 1)
      else if (k.split(' ').some(w => w.startsWith(q))) score = Math.min(score, 2)
      else if (q.length >= 3 && k.includes(q)) score = Math.min(score, 3)
    }
    if (score < Infinity) scored.push({ bank, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.bank.name.localeCompare(b.bank.name, 'pt-BR'))
    .slice(0, limit)
    .map(s => s.bank)
}
