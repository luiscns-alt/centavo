import type { Account } from '../../core/db'
import { AccountIcon } from './AccountIcon'

interface Props {
  accounts: Account[]
  value: number | null
  onChange: (id: number) => void
  /** Greyed-out option (e.g. the other side of a transfer) */
  disabledId?: number | null
  label: string
}

/** Horizontal account picker, same chip language as categories but neutral (accounts carry no financial direction) */
export function AccountChips({ accounts, value, onChange, disabledId, label }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pb-1 md:flex-wrap md:overflow-visible" role="radiogroup" aria-label={label}>
      {accounts.map(a => {
        const id = a.id as number
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={[
              'flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-medium whitespace-nowrap transition-colors',
              selected
                ? 'bg-ink border-ink text-bg'
                : id === disabledId
                  ? 'bg-surface border-border text-muted opacity-50'
                  : 'bg-surface border-border text-muted hover:text-ink hover:border-muted/40',
            ].join(' ')}
          >
            <AccountIcon account={a} size="inline" />
            <span>{a.name}</span>
          </button>
        )
      })}
    </div>
  )
}
