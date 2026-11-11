import type { BudgetStatus } from './budgets'

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
  const h = thin ? 'h-1' : 'h-1.5'
  const over = status === 'over' && limit > 0
  // When over, the bar's full width is the spending; the limit sits at limit/spent
  const scale = over ? spent : limit
  const limitPct = over ? (limit / spent) * 100 : 100
  const fillPct = scale > 0 ? Math.min(100, (Math.max(spent, 0) / scale) * 100) : spent > 0 ? 100 : 0
  const fillTone = status === 'warning' || over ? 'bg-expense' : 'bg-ink/55'

  return (
    <div className={`relative ${h} rounded-full bg-border overflow-hidden`} aria-hidden>
      {over ? (
        <>
          <div className={`absolute inset-y-0 left-0 bg-expense bar-grow`} style={{ width: `${limitPct}%` }} />
          <div className="absolute inset-y-0 right-0 bar-hatch" style={{ left: `calc(${limitPct}% + 2px)` }} />
        </>
      ) : (
        <div className={`absolute inset-y-0 left-0 rounded-full ${fillTone} bar-grow`} style={{ width: `${fillPct}%` }} />
      )}
      {pace != null && !over && limit > 0 && pace > 0 && pace < limit && (
        <div className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: `${(pace / limit) * 100}%` }} />
      )}
    </div>
  )
}
