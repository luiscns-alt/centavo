/**
 * Typed style variants for the shared building blocks (class-variance-authority). A variant name
 * that doesn't exist is a type error; color classes inside are checked by the lint rule
 * architecture/tailwind-colors against the theme tokens in index.css.
 */
import { cva, type VariantProps } from 'class-variance-authority'

/** Action button — full-size (forms, dialogs) */
export const button = cva('py-4 px-5 rounded-xl text-[15px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed', {
  variants: {
    variant: {
      primary: 'bg-ink text-bg hover:opacity-90',
      ghost: 'bg-surface text-ink border border-border hover:bg-bg',
      income: 'bg-income-light text-income hover:opacity-90',
      expense: 'bg-expense-light text-expense hover:opacity-90',
      'solid-income': 'bg-income text-white hover:opacity-90',
      'solid-expense': 'bg-expense text-white hover:opacity-90',
    },
    fullWidth: { true: 'w-full', false: '' },
  },
  defaultVariants: { variant: 'primary', fullWidth: false },
})
export type ButtonVariants = VariantProps<typeof button>

/**
 * Pill chip used by pickers (categories, accounts, choices). Color only when the choice has a
 * financial direction (income/expense); everything else is neutral ink.
 */
export const chip = cva('flex items-center rounded-full border whitespace-nowrap transition-colors', {
  variants: {
    size: {
      md: 'h-9 px-3.5 text-[13px] font-medium',
      sm: 'h-8 px-3 text-[12px] font-semibold',
    },
    tone: { neutral: '', income: '', expense: '' },
    selected: { true: '', false: '' },
    /** The "+ Nova" chip that opens an editor */
    add: { true: 'gap-1 border-dashed border-muted/50 text-muted hover:text-ink hover:border-muted', false: '' },
    dimmed: { true: 'opacity-50', false: '' },
  },
  compoundVariants: [
    { add: false, size: 'md', class: 'gap-1.5' },
    { add: false, selected: false, class: 'border-border text-muted hover:text-ink' },
    { add: false, selected: false, size: 'md', class: 'bg-surface hover:border-muted/40' },
    { selected: true, tone: 'neutral', class: 'bg-ink border-ink text-bg' },
    { selected: true, tone: 'income', class: 'bg-income-light border-income text-income' },
    { selected: true, tone: 'expense', class: 'bg-expense-light border-expense text-expense' },
  ],
  defaultVariants: { size: 'md', tone: 'neutral', selected: false, add: false, dimmed: false },
})
export type ChipVariants = VariantProps<typeof chip>
