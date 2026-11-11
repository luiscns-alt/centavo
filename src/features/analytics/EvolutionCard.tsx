import { ArrowRight } from 'lucide-react'
import { monthDiff } from './series'
import { useMonthlySeries } from './useMonthlySeries'
import { MonthBarChart, TooltipRow } from '../../shared/charts/MonthBarChart'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import { monthKey, MONTH_LONG, MONTH_SHORT } from '../../shared/utils/dates'
import { formatBRL, formatDelta } from '../../shared/utils/money'
import { css, cx } from '../../../styled-system/css'

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
    <section className={css({ mx: '5', md: { mx: '0', px: '6' }, mt: '6', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '5', pt: '5', pb: '4' })}>
      <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3' })}>
        <div>
          <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>
            {label}
          </div>
          <div className={cx(css({ mt: '1', fontSize: '20', fontWeight: 'bold', color: 'ink', lineHeight: 'tight' }), 'nums')}>
            {loading || !sel ? '–' : formatBRL(sel.cumulative)}
          </div>
          {sel && !loading && (
            <div className={cx(css({ fontSize: '12', color: 'muted', mt: '0.5' }), 'nums')}>
              {formatDelta(sel.net)} de resultado em {MONTH_LONG[sel.month - 1]}
            </div>
          )}
        </div>
        <span className={css({ fontSize: '12', color: 'muted', whiteSpace: 'nowrap', pt: '0.5' })}>{WINDOW} meses</span>
      </div>

      <div className={css({ mt: '4' })}>
        {isEmpty ? (
          <p className={css({ fontSize: '13', color: 'muted', textAlign: 'center', py: '10', m: '0' })}>
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
                  <div className={css({ fontWeight: 'semibold', color: 'ink', mb: '1', textTransform: 'capitalize' })}>{MONTH_LONG[p.month - 1]} {p.year}</div>
                  <TooltipRow label={label} value={formatBRL(p.cumulative)} strong />
                  <TooltipRow label="Resultado do mês" value={p.hasData ? formatDelta(p.net) : '—'} />
                </>
              )
            }}
            onSelect={i => nav.onSelect?.(points[i].year, points[i].month)}
          />
        )}
      </div>

      <div className={css({ mt: '2', pt: '3', borderTopWidth: '1px', borderColor: 'border', display: 'flex', justifyContent: 'flex-end' })}>
        <button
          onClick={onOpenCompare}
          className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', fontSize: '13', fontWeight: 'semibold', color: 'ink', _hover: { opacity: '0.7' }, transition: 'opacity' })}
        >
          Ver comparativo <ArrowRight size={15} strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}
