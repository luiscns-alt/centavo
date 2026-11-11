import { css, cva } from '../../../styled-system/css'

/** Income green, expense vinho; a refund is money back for an expense — neutral ink, never green */
const tile = cva({
  base: { w: '9', h: '9', rounded: 'tile', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16', flexShrink: '0' },
  variants: { type: { income: { bg: 'income.light' }, expense: { bg: 'expense.light' }, refund: { bg: 'border/60' } } },
})
const amountTone = cva({
  base: { fontSize: '15', fontWeight: 'bold', flexShrink: '0', fontVariantNumeric: 'tabular-nums lining-nums' },
  variants: { type: { income: { color: 'income' }, expense: { color: 'expense' }, refund: { color: 'ink' } } },
})
const row = cva({
  base: { display: 'flex', alignItems: 'center', gap: '3', py: '3' },
  variants: { bordered: { true: { borderBottomWidth: '1px', borderColor: 'border', _last: { borderBottomWidth: '0' } }, false: {} } },
})
const body = css({ flex: '1', minW: '0' })
const titleText = css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true, lineHeight: 'snug' })
const subtitleText = css({ fontSize: '12', color: 'muted', truncate: true })

interface TransactionRowProps {
  icon: string
  /** refund: money back for an expense — neutral ink '+', never income green */
  type: 'income' | 'expense' | 'refund'
  title: string
  subtitle?: string
  amount: string
  /** Hairline below (off when the parent draws it) */
  bordered?: boolean
}

export function TransactionRow({ icon, type, title, subtitle, amount, bordered = true }: TransactionRowProps) {
  return (
    <div className={row({ bordered })}>
      <div className={tile({ type })} aria-hidden>
        {icon}
      </div>

      <div className={body}>
        <div className={titleText}>{title}</div>
        {subtitle && <div className={subtitleText}>{subtitle}</div>}
      </div>

      <div className={amountTone({ type })}>
        {type === 'expense' ? '−' : '+'}{amount}
      </div>
    </div>
  )
}
