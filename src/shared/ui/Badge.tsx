import type { ReactNode } from 'react'
import { cva, type RecipeVariantProps } from '../../../styled-system/css'

const badge = cva({
  base: {
    display: 'inline-flex', alignItems: 'center', gap: '1', px: '2.5', py: '1', rounded: 'full',
    fontSize: '11', fontWeight: 'semibold',
  },
  variants: {
    variant: {
      income: { bg: 'income.light', color: 'income' },
      expense: { bg: 'expense.light', color: 'expense' },
      neutral: { bg: 'border', color: 'muted' },
    },
  },
  defaultVariants: { variant: 'neutral' },
})

export function Badge({ variant, children }: RecipeVariantProps<typeof badge> & { children: ReactNode }) {
  return <span className={badge({ variant })}>{children}</span>
}
