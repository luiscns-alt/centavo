import { cva } from 'class-variance-authority'
import type { BudgetStatus } from './budgets'

const track = cva('relative rounded-full bg-border overflow-hidden', {
  variants: { thin: { true: 'h-1', false: 'h-1.5' } },
})
/** Fill below the limit: neutral ink while ok, vinho from 80% on */
const fill = cva('absolute inset-y-0 left-0 bar-grow', {
  variants: {
    status: { none: 'rounded-full bg-ink/55', ok: 'rounded-full bg-ink/55', warning: 'rounded-full bg-expense', over: 'bg-expense' },
  },
})

/**
 * Spending against a limit. No traffic-light colors (DESIGN.md › Orçamentos):
 * ok = neutral ink bar · warning = vinho bar · over = vinho up to the limit + striped overflow.
 * The text next to it (icon + words) carries the status too.
 */
export function BudgetBar({ spent, limit, status, pace, thin = false }: {
  spent: number
  limit: number
  status: BudgetStatus
  /** Where spending "should" be by today (0–limit), drawn as a tick */
  pace?: number | null
  thin?: boolean
}) {
  const over = status === 'over' && limit > 0
  // When over, the bar's full width is the spending; the limit sits at limit/spent
  const scale = over ? spent : limit
  const limitPct = over ? (limit / spent) * 100 : 100
  const fillPct = scale > 0 ? Math.min(100, (Math.max(spent, 0) / scale) * 100) : spent > 0 ? 100 : 0

  return (
    <div className={track({ thin })} aria-hidden>
      {over ? (
        <>
          <div className={fill({ status: 'over' })} style={{ width: `${limitPct}%` }} />
          <div className="absolute inset-y-0 right-0 bar-hatch" style={{ left: `calc(${limitPct}% + 2px)` }} />
        </>
      ) : (
        <div className={fill({ status })} style={{ width: `${fillPct}%` }} />
      )}
      {pace != null && !over && limit > 0 && pace > 0 && pace < limit && (
        <div className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: `${(pace / limit) * 100}%` }} />
      )}
    </div>
  )
}
