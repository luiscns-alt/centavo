import { css, cva } from '../../../styled-system/css'

const card = cva({
  base: { rounded: 'xl', px: '4', py: '3', borderWidth: '1px' },
  variants: {
    variant: {
      positive: { bg: 'income.light', borderColor: 'income/20' },
      negative: { bg: 'expense.light', borderColor: 'expense/20' },
    },
  },
})
const heading = cva({
  base: { fontSize: '13', fontWeight: 'semibold', mb: '0.5' },
  variants: { variant: { positive: { color: 'income' }, negative: { color: 'expense' } } },
})
const text = css({ fontSize: '13', color: 'ink' })

interface AlertCardProps {
  variant: 'positive' | 'negative'
  title: string
  description: string
}

export function AlertCard({ variant, title, description }: AlertCardProps) {
  return (
    <div className={card({ variant })}>
      <div className={heading({ variant })}>{title}</div>
      <div className={text}>{description}</div>
    </div>
  )
}
