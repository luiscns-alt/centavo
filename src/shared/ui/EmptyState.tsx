import { Plus } from 'lucide-react'
import { css, cx } from '../../../styled-system/css'
import { slideUp } from './atoms'

const wrap = css({ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: '14', px: '6' })
const lines = css({ w: '14', mb: '5', display: 'flex', flexDirection: 'column', gap: '1.5' })
const line = css({ h: 'hairline', bg: 'border' })
const shortLine = css({ w: '2/3' })
const titleText = css({ fontSize: '15', fontWeight: 'semibold', color: 'ink' })
const descText = css({ fontSize: '13', color: 'muted', mt: '1', maxW: '[280px]', lineHeight: 'relaxed' })
const action = css({
  mt: '5', display: 'inline-flex', alignItems: 'center', gap: '1.5', h: '9', px: '4', rounded: 'full',
  borderWidth: '1px', borderColor: 'border', bg: 'surface', fontSize: '13', fontWeight: 'semibold', color: 'ink',
  transitionProperty: 'colors', transitionDuration: 'normal', _hover: { bg: 'bg' },
})

interface EmptyStateProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className={cx(wrap, slideUp)}>
      {/* Ledger lines — a quiet nod to the empty notebook page */}
      <div className={lines} aria-hidden>
        <span className={line} />
        <span className={line} />
        <span className={cx(line, shortLine)} />
      </div>
      <div className={titleText}>{title}</div>
      {description && <p className={descText}>{description}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className={action}>
          <Plus size={15} strokeWidth={2} />
          {actionLabel}
        </button>
      )}
    </div>
  )
}
