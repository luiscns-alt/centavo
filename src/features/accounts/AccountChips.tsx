import { AccountIcon } from './AccountIcon'
import { chip } from '../../shared/ui/variants'
import type { Account } from '../../core/types'
import { css, cx } from '../../../styled-system/css'
import { noScrollbar } from '../../shared/ui/atoms'

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
    <div className={cx(css({ display: 'flex', gap: '2', overflowX: 'auto', px: '5', pb: '1', md: { flexWrap: 'wrap', overflow: 'visible' } }), noScrollbar)} role="radiogroup" aria-label={label}>
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
            className={chip({ selected, dimmed: !selected && id === disabledId })}
          >
            <AccountIcon account={a} size="inline" />
            <span>{a.name}</span>
          </button>
        )
      })}
    </div>
  )
}
