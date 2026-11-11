import { chip } from './variants'

/** Cash-register style money field: digits fill from the right ("1250" → "12,50"); value in centavos */
export function MoneyInput({ value, onChange, label, placeholder = '0,00', className = '' }: {
  value: number | null
  onChange: (centavos: number | null) => void
  label: string
  placeholder?: string
  className?: string
}) {
  const display = value === null ? '' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value / 100)
  return (
    <div className={`h-11 px-3 rounded-[10px] border border-border bg-bg flex items-center gap-1.5 focus-within:border-muted/60 ${className}`}>
      <span className="text-[14px] font-semibold text-muted">R$</span>
      <input
        inputMode="numeric"
        aria-label={label}
        placeholder={placeholder}
        value={display}
        onChange={e => {
          const d = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12)
          onChange(d === '' ? null : Number(d))
        }}
        className="flex-1 min-w-0 bg-transparent text-[15px] font-semibold nums text-ink placeholder:text-muted placeholder:font-normal outline-none"
      />
    </div>
  )
}

/** Small uppercase field label */
export const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-1.5">{children}</div>
)

/** Neutral single-choice chips (ink when selected) */
export function Choice<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
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
