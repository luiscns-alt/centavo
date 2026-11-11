import { css, cx } from '../../../styled-system/css'
interface CategoryRowProps {
  icon: string
  name: string
  type: 'income' | 'expense'
  amount: string
  /** Share of this category within its type, 0–1 */
  share: number
  /** Stagger for the bar animation */
  index?: number
}

export function CategoryRow({ icon, name, type, amount, share, index = 0 }: CategoryRowProps) {
  const isIncome = type === 'income'
  const pct = Math.round(share * 100)

  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '3', py: '3' })}>
      <div
        className={css({ w: '9', h: '9', rounded: 'tile', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16', flexShrink: '0' }, isIncome ? { bg: 'income.light' } : { bg: 'expense.light' })}
        aria-hidden
      >
        {icon}
      </div>

      <div className={css({ flex: '1', minW: '0' })}>
        <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
          <span className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{name}</span>
          <span className={cx(css({ fontSize: '15', fontWeight: 'bold', color: 'ink', flexShrink: '0' }), 'nums')}>{amount}</span>
        </div>
        <div className={css({ mt: '2', display: 'flex', alignItems: 'center', gap: '3' })}>
          <div className={css({ flex: '1', h: '1', rounded: 'full', bg: 'border', overflow: 'hidden' })}>
            <div
              className={cx(css({ h: 'full', rounded: 'full' }, isIncome ? { bg: 'income' } : { bg: 'expense' }), 'bar-grow')}
              style={{ width: `${Math.max(pct, 2)}%`, animationDelay: `${index * 40}ms` }}
            />
          </div>
          <span className={cx(css({ fontSize: '12', color: 'muted', w: '9', textAlign: 'right' }), 'nums')}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}
