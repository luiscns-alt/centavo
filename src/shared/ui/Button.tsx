import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../../styled-system/css'
import { button, type ButtonVariants } from './variants'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariants

export function Button({ variant, fullWidth, className, children, ...props }: ButtonProps) {
  return (
    <button {...props} className={cx(button({ variant, fullWidth }), className)}>
      {children}
    </button>
  )
}
