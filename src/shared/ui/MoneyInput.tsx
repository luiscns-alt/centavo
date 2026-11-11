import type { ReactNode } from 'react'
import { css, cx } from '../../../styled-system/css'
import { chip } from './variants'

const field = css({
  h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg',
  display: 'flex', alignItems: 'center', gap: '1.5',
  _focusWithin: { borderColor: 'muted/60' },
})
const fieldOnSurface = css({ bg: 'surface' })
const currency = css({ fontSize: '14', fontWeight: 'semibold', color: 'muted' })
const input = css({
  flex: '1', minW: '0', bg: 'transparent', fontSize: '15', fontWeight: 'semibold', color: 'ink', outline: 'none',
  fontVariantNumeric: 'tabular-nums lining-nums',
  _placeholder: { color: 'muted', fontWeight: 'normal' },
})
const fieldLabel = css({
  fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '1.5',
})

/** Cash-register style money field: digits fill from the right ("1250" → "12,50"); value in centavos */
export function MoneyInput({ value, onChange, label, placeholder = '0,00', onSurface = false, className }: {
  value: number | null
  onChange: (centavos: number | null) => void
  label: string
  placeholder?: string
  /** Inside a white card (the default sits on the page background) */
  onSurface?: boolean
  /** Layout only (flex, width) — never colors */
  className?: string
}) {
  const display = value === null ? '' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value / 100)
  return (
    <div className={cx(field, onSurface && fieldOnSurface, className)}>
      <span className={currency}>R$</span>
      <input
        inputMode="numeric"
        aria-label={label}
        placeholder={placeholder}
        value={display}
        onChange={e => {
          const d = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12)
          onChange(d === '' ? null : Number(d))
        }}
        className={input}
      />
    </div>
  )
}

/** Small uppercase field label */
export const FieldLabel = ({ children }: { children: ReactNode }) => <div className={fieldLabel}>{children}</div>

/** Neutral single-choice chips (ink when selected) */
export function Choice<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' })} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={chip({ size: 'sm', selected: value === o.id })}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
