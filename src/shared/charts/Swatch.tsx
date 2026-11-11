import { useId } from 'react'
import { css, cva } from '../../../styled-system/css'

const hatchBase = css({ fill: 'expense' })
const hatchLine = css({ stroke: 'surface' })
const swatchBox = css({ flexShrink: '0' })
const swatchFill = cva({ variants: { tone: { income: { fill: 'income' }, 'expense-tint': { fill: 'expense' }, expense: {} } } })

/** Diagonal stripes over the expense color — secondary encoding so Saídas never rely on color alone */
export function HatchPattern({ id }: { id: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
      <rect width="5" height="5" className={hatchBase} />
      <line x1="0" y1="0" x2="0" y2="5" className={hatchLine} strokeWidth="1.6" strokeOpacity=".55" />
    </pattern>
  )
}

/** Legend / tooltip key: solid for income, hatched for expense, light tint for a secondary expense part */
export function Swatch({ tone }: { tone: 'income' | 'expense' | 'expense-tint' }) {
  const id = useId()
  return (
    <svg width="10" height="10" className={swatchBox} aria-hidden>
      {tone === 'expense' && <defs><HatchPattern id={id} /></defs>}
      <rect
        width="10"
        height="10"
        rx="2.5"
        className={swatchFill({ tone })}
        fill={tone === 'expense' ? `url(#${id})` : undefined}
        fillOpacity={tone === 'expense-tint' ? 0.32 : undefined}
      />
    </svg>
  )
}
