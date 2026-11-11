type BadgeVariant = 'income' | 'expense' | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  income:  'bg-income-light text-income',
  expense: 'bg-expense-light text-expense',
  neutral: 'bg-border text-muted',
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold',
        variantClasses[variant],
      ].join(' ')}
    >
      {children}
    </span>
  )
}
