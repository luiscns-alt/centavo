interface TransactionRowProps {
  icon: string
  type: 'income' | 'expense'
  title: string
  subtitle?: string
  amount: string
}

export function TransactionRow({ icon, type, title, subtitle, amount }: TransactionRowProps) {
  const isIncome = type === 'income'

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      {/* Icon */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[14px] flex-shrink-0 ${
          isIncome ? 'bg-income-light' : 'bg-expense-light'
        }`}
      >
        {icon}
      </div>

      {/* Middle: title + optional subtitle */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-ink truncate">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-muted">{subtitle}</div>
        )}
      </div>

      {/* Amount */}
      <div
        className={`text-[14px] font-bold nums flex-shrink-0 ${
          isIncome ? 'text-income' : 'text-expense'
        }`}
      >
        {isIncome ? '+' : '-'}{amount}
      </div>
    </div>
  )
}
