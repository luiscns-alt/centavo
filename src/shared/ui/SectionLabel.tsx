import type { ReactNode } from 'react'
import { css } from '../../../styled-system/css'

const row = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', mb: '1' })
const label = css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })
const aside = css({ fontSize: '12', color: 'muted', fontVariantNumeric: 'tabular-nums lining-nums' })

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={row}>
      <div className={label}>{children}</div>
      {right && <div className={aside}>{right}</div>}
    </div>
  )
}
