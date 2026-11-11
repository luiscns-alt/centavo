/**
 * Typed style variants of the shared building blocks — Panda CSS atomic recipes. Every color,
 * size and radius is a theme token (strictTokens): a typo or an off-palette color doesn't compile,
 * and a variant that doesn't exist is a type error.
 */
import { cva, type RecipeVariantProps } from '../../../styled-system/css'

/** Action button — full-size (forms, dialogs) */
export const button = cva({
  base: {
    py: '4', px: '5', rounded: 'xl', fontSize: '15', fontWeight: 'bold',
    transitionProperty: 'opacity', transitionDuration: 'normal',
    _hover: { opacity: '0.9' },
    _disabled: { opacity: '0.4', cursor: 'not-allowed', _hover: { opacity: '0.4' } },
  },
  variants: {
    variant: {
      primary: { bg: 'ink', color: 'bg' },
      ghost: { bg: 'surface', color: 'ink', borderWidth: '1px', borderColor: 'border', _hover: { bg: 'bg', opacity: '1' } },
      income: { bg: 'income.light', color: 'income' },
      expense: { bg: 'expense.light', color: 'expense' },
      'solid-income': { bg: 'income', color: 'white' },
      'solid-expense': { bg: 'expense', color: 'white' },
    },
    fullWidth: { true: { w: 'full' }, false: {} },
  },
  defaultVariants: { variant: 'primary', fullWidth: false },
})
export type ButtonVariants = RecipeVariantProps<typeof button>

/**
 * Pill chip used by pickers (categories, accounts, choices). Color only when the choice has a
 * financial direction (income/expense); everything else is neutral ink.
 */
export const chip = cva({
  base: {
    display: 'flex', alignItems: 'center', rounded: 'full', borderWidth: '1px', whiteSpace: 'nowrap',
    transitionProperty: 'colors', transitionDuration: 'normal',
  },
  variants: {
    size: {
      md: { h: '9', px: '3.5', fontSize: '13', fontWeight: 'medium' },
      sm: { h: '8', px: '3', fontSize: '12', fontWeight: 'semibold' },
    },
    tone: { neutral: {}, income: {}, expense: {} },
    selected: { true: {}, false: {} },
    /** The "+ Nova" chip that opens an editor */
    add: {
      true: { gap: '1', borderStyle: 'dashed', borderColor: 'muted/50', color: 'muted', _hover: { color: 'ink', borderColor: 'muted' } },
      false: {},
    },
    dimmed: { true: { opacity: '0.5' }, false: {} },
  },
  compoundVariants: [
    { add: false, size: 'md', css: { gap: '1.5' } },
    { add: false, selected: false, css: { borderColor: 'border', color: 'muted', _hover: { color: 'ink' } } },
    { add: false, selected: false, size: 'md', css: { bg: 'surface', _hover: { borderColor: 'muted/40' } } },
    { selected: true, tone: 'neutral', css: { bg: 'ink', borderColor: 'ink', color: 'bg' } },
    { selected: true, tone: 'income', css: { bg: 'income.light', borderColor: 'income', color: 'income' } },
    { selected: true, tone: 'expense', css: { bg: 'expense.light', borderColor: 'expense', color: 'expense' } },
  ],
  defaultVariants: { size: 'md', tone: 'neutral', selected: false, add: false, dimmed: false },
})
export type ChipVariants = RecipeVariantProps<typeof chip>
