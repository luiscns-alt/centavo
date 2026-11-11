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
    <div className="flex items-center gap-3 py-3">
      <div
        className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] shrink-0 ${
          isIncome ? 'bg-income-light' : 'bg-expense-light'
        }`}
        aria-hidden
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium text-ink truncate">{name}</span>
          <span className="text-[15px] font-bold nums text-ink shrink-0">{amount}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full bar-grow ${isIncome ? 'bg-income' : 'bg-expense'}`}
              style={{ width: `${Math.max(pct, 2)}%`, animationDelay: `${index * 40}ms` }}
            />
          </div>
          <span className="text-[12px] text-muted nums w-9 text-right">{pct}%</span>
        </div>
      </div>
    </div>
  )
}
