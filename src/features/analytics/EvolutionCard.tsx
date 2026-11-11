import { ArrowRight } from 'lucide-react'
import { monthDiff } from './series'
import { useMonthlySeries } from './useMonthlySeries'
import { MonthBarChart, TooltipRow } from '../../shared/charts/MonthBarChart'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import { monthKey, MONTH_LONG, MONTH_SHORT } from '../../shared/utils/dates'
import { formatBRL, formatDelta } from '../../shared/utils/money'

const WINDOW = 6

interface Props {
  nav: MonthNav
  /** null = patrimônio across all accounts */
  accountIds: number[] | null
  onOpenCompare: () => void
}


/** Patrimônio (or one account's balance) at the end of each of the last months */
export function EvolutionCard({ nav, accountIds, onOpenCompare }: Props) {
  const label = accountIds === null ? 'Patrimônio' : accountIds.length === 1 ? 'Saldo da conta' : 'Saldo do banco'
  const now = new Date()
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const selected = { year: nav.year, month: nav.month }

  // Keep the window anchored on today while the selection is inside it, so clicking a bar doesn't scroll the chart
  const back = monthDiff(selected, current)
  const end = back >= 0 && back < WINDOW ? current : selected

  const { points, loading } = useMonthlySeries(end.year, end.month, WINDOW, accountIds)
  const selectedKey = monthKey(selected.year, selected.month)
  const selIndex = points.findIndex(p => p.key === selectedKey)
  const sel = points[selIndex]
  const isEmpty = !loading && points.every(p => p.cumulative === 0 && !p.hasData)

  return (
    <section className="mx-5 md:mx-0 mt-6 bg-surface border border-border rounded-2xl px-5 md:px-6 pt-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">
            {label}
          </div>
          <div className="mt-1 text-[20px] font-bold nums text-ink leading-tight">
            {loading || !sel ? '–' : formatBRL(sel.cumulative)}
          </div>
          {sel && !loading && (
            <div className="text-[12px] text-muted mt-0.5 nums">
              {formatDelta(sel.net)} de resultado em {MONTH_LONG[sel.month - 1]}
            </div>
          )}
        </div>
        <span className="text-[12px] text-muted whitespace-nowrap pt-0.5">{WINDOW} meses</span>
      </div>

      <div className="mt-4">
        {isEmpty ? (
          <p className="text-[13px] text-muted text-center py-10 m-0">
            O gráfico aparece quando houver lançamentos.
          </p>
        ) : (
          <MonthBarChart
            title={`${label} nos últimos ${WINDOW} meses`}
            height={168}
            groups={points.map(p => ({
              key: p.key,
              label: MONTH_SHORT[p.month - 1],
              bars: [{ value: p.cumulative, tone: p.cumulative < 0 ? 'expense' : 'income', hatched: p.cumulative < 0 }],
              dim: p.key !== selectedKey,
              ariaLabel: `${MONTH_LONG[p.month - 1]} ${p.year}: ${label.toLowerCase()} ${formatBRL(p.cumulative)}`,
            }))}
            renderTooltip={i => {
              const p = points[i]
              return (
                <>
                  <div className="font-semibold text-ink mb-1 capitalize">{MONTH_LONG[p.month - 1]} {p.year}</div>
                  <TooltipRow label={label} value={formatBRL(p.cumulative)} strong />
                  <TooltipRow label="Resultado do mês" value={p.hasData ? formatDelta(p.net) : '—'} />
                </>
              )
            }}
            onSelect={i => nav.onSelect?.(points[i].year, points[i].month)}
          />
        )}
      </div>

      <div className="mt-2 pt-3 border-t border-border flex justify-end">
        <button
          onClick={onOpenCompare}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:opacity-70 transition-opacity"
        >
          Ver comparativo <ArrowRight size={15} strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}
