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
  const isIncome = type === 'income'
  const tile = isIncome ? 'bg-income-light' : type === 'refund' ? 'bg-border/60' : 'bg-expense-light'
  const tone = isIncome ? 'text-income' : type === 'refund' ? 'text-ink' : 'text-expense'

  return (
    <div className={`flex items-center gap-3 py-3 ${bordered ? 'border-b border-border last:border-0' : ''}`}>
      <div
        className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] shrink-0 ${tile}`}
        aria-hidden
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-ink truncate leading-snug">{title}</div>
        {subtitle && <div className="text-[12px] text-muted truncate">{subtitle}</div>}
      </div>

      <div className={`text-[15px] font-bold nums shrink-0 ${tone}`}>
        {type === 'expense' ? '−' : '+'}{amount}
      </div>
    </div>
  )
}
