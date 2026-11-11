import type { ButtonHTMLAttributes } from 'react'
import { button, type ButtonVariants } from './variants'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariants

export function Button({ variant, fullWidth, className, children, ...props }: ButtonProps) {
  return (
    <button {...props} className={button({ variant, fullWidth, className })}>
      {children}
    </button>
  )
}
