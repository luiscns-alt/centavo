import { cva } from 'class-variance-authority'

/** Income green, expense vinho; a refund is money back for an expense — neutral ink, never green */
const tile = cva('w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] shrink-0', {
  variants: { type: { income: 'bg-income-light', expense: 'bg-expense-light', refund: 'bg-border/60' } },
})
const amountTone = cva('text-[15px] font-bold nums shrink-0', {
  variants: { type: { income: 'text-income', expense: 'text-expense', refund: 'text-ink' } },
})
const row = cva('flex items-center gap-3 py-3', {
  variants: { bordered: { true: 'border-b border-border last:border-0', false: '' } },
})

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

      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-ink truncate leading-snug">{title}</div>
        {subtitle && <div className="text-[12px] text-muted truncate">{subtitle}</div>}
      </div>

      <div className={amountTone({ type })}>
        {type === 'expense' ? '−' : '+'}{amount}
      </div>
    </div>
  )
}
