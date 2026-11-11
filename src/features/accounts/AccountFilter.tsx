import { ChevronDown } from 'lucide-react'
import { useAccounts } from './useAccounts'
import { groupByBank } from './accountSelection'
import { AccountIcon } from './AccountIcon'
import { css } from '../../../styled-system/css'

/** Account filter state owned by App and passed to the month-based screens */
export interface AccountScope {
  /** '' all · 'a:<id>' one account or card · 'b:<id>' a bank with its cards */
  selection: string
  /** Resolved account ids, null = all */
  ids: number[] | null
  setSelection: (s: string) => void
}

interface Props {
  value: string
  onChange: (s: string) => void
}

/** "Todas as contas" ▾ — banks with cards offer the whole bank, its account, or each card */
export function AccountFilter({ value, onChange }: Props) {
  const accounts = useAccounts()
  if (!accounts || (accounts.length < 2 && value === '')) return null

  const visible = accounts.filter(a => !a.archived || value === `a:${a.id}` || value === `b:${a.id}`)
  const groups = groupByBank(visible)
  const m = /^([ab]):(\d+)$/.exec(value)
  const current = m ? accounts.find(a => a.id === Number(m[2])) : undefined
  const label = !current ? 'Todas as contas' : m?.[1] === 'b' ? `${current.name} (tudo)` : current.name

  return (
    <label className={css({ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '1.5', h: '9', pl: '3', pr: '2.5', rounded: 'full', borderWidth: '1px', borderColor: 'border', bg: 'surface', fontSize: '13', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' }, transition: 'colors', cursor: 'pointer', _focusWithin: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'ink' } })}>
      {current ? <AccountIcon account={current} size="inline" /> : <span aria-hidden>∑</span>}
      <span className={css({ maxW: '[160px]', truncate: true })}>{label}</span>
      <ChevronDown size={14} strokeWidth={2} className={css({ color: 'muted' })} />
      <select
        aria-label="Filtrar por conta"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={css({ position: 'absolute', inset: '0', opacity: '0', cursor: 'pointer' })}
      >
        <option value="">Todas as contas</option>
        {groups.map(({ bank, cards }) =>
          cards.length === 0 ? (
            <option key={bank.id} value={`a:${bank.id}`}>{bank.icon} {bank.name}{bank.archived ? ' (arquivada)' : ''}</option>
          ) : (
            <optgroup key={bank.id} label={bank.name}>
              <option value={`b:${bank.id}`}>{bank.name} — conta + cartões</option>
              <option value={`a:${bank.id}`}>{bank.name} · Conta</option>
              {cards.map(c => <option key={c.id} value={`a:${c.id}`}>{c.name} · Cartão</option>)}
            </optgroup>
          ),
        )}
      </select>
    </label>
  )
}
