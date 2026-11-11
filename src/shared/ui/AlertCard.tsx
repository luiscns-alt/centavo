type AlertVariant = 'positive' | 'negative'

interface AlertCardProps {
  variant: AlertVariant
  title: string
  description: string
}

const variantClasses: Record<AlertVariant, { wrapper: string; title: string }> = {
  positive: {
    wrapper: 'bg-income-light border border-income/20',
    title:   'text-income',
  },
  negative: {
    wrapper: 'bg-expense-light border border-expense/20',
    title:   'text-expense',
  },
}

export function AlertCard({ variant, title, description }: AlertCardProps) {
  const { wrapper, title: titleClass } = variantClasses[variant]

  return (
    <div className={`rounded-xl px-4 py-3 ${wrapper}`}>
      <div className={`text-[13px] font-semibold mb-0.5 ${titleClass}`}>{title}</div>
      <div className="text-[13px] text-ink">{description}</div>
    </div>
  )
}
