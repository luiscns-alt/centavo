import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'income' | 'expense' | 'solid-income' | 'solid-expense'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:       'bg-ink text-bg hover:opacity-90',
  ghost:         'bg-surface text-ink border border-border hover:bg-bg',
  income:        'bg-income-light text-income hover:opacity-90',
  expense:       'bg-expense-light text-expense hover:opacity-90',
  'solid-income':  'bg-income text-white hover:opacity-90',
  'solid-expense': 'bg-expense text-white hover:opacity-90',
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        'py-4 px-5 rounded-xl text-[15px] font-bold transition-opacity',
        variantClasses[variant],
        fullWidth ? 'w-full' : '',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
