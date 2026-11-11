import { useState } from 'react'
import { useMonthlySeries } from './useMonthlySeries'
import type { MonthPoint } from './series'
import { MonthBarChart, TooltipRow } from '../../shared/charts/MonthBarChart'
import { Swatch } from '../../shared/charts/Swatch'
import { EmptyState } from '../../shared/ui/EmptyState'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import type { AccountScope } from '../accounts'
import { CardInsightsSection } from '../credit-cards'
import { MONTH_LONG, MONTH_SHORT } from '../../shared/utils/dates'
import { formatBRL, formatAmount, formatAmountDelta, formatDelta, toneClass } from '../../shared/utils/money'
import { STORAGE_KEYS } from '../../shared/constants/storageKeys'
import { readLocal, writeLocal } from '../../shared/utils/storage'
import { css, cx } from '../../../styled-system/css'

type Period = 6 | 12

function readPeriod(): Period {
  return readLocal(STORAGE_KEYS.comparePeriod) === '12' ? 12 : 6
}


interface Props {
  nav: MonthNav
  account: AccountScope
  onAdd: () => void
  onOpenCard: (id: number) => void
}

/** Comparativo panel of Análises (header and tabs live in Analyses) */
export function Comparison({ nav, account, onAdd, onOpenCard }: Props) {
  const [period, setPeriodState] = useState<Period>(readPeriod)
  const { points, loading } = useMonthlySeries(nav.year, nav.month, period, account.ids)

  function setPeriod(p: Period) {
    setPeriodState(p)
    writeLocal(STORAGE_KEYS.comparePeriod, String(p))
  }

  const withData = points.filter(p => p.hasData)
  const isEmpty = !loading && withData.length === 0

  return (
    <>
        {/* Filters + legend: one row above the chart */}
        <div className={css({ px: '5', md: { px: '0', mt: '0' }, mt: '2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', flexWrap: 'wrap' })}>
          <div className={css({ display: 'inline-flex', bg: 'border/70', rounded: 'full', p: '0.5' })} role="tablist" aria-label="Período">
            {([6, 12] as Period[]).map(p => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={css({ h: '8', px: '3.5', rounded: 'full', fontSize: '13', fontWeight: 'semibold', transition: 'colors' }, period === p ? { bg: 'surface', color: 'ink', shadow: 'sm' } : { color: 'muted', _hover: { color: 'ink' } })}
              >
                {p} meses
              </button>
            ))}
          </div>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '4', fontSize: '12', fontWeight: 'medium', color: 'ink' })}>
            <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5' })}><Swatch tone="income" />Entradas</span>
            <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5' })}><Swatch tone="expense" />Saídas</span>
          </div>
        </div>

        {isEmpty ? (
          <div className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' })}>
            <EmptyState
              title="Sem lançamentos no período"
              description={`Nenhuma entrada ou saída nos últimos ${period} meses até ${MONTH_LONG[nav.month - 1]}.`}
              actionLabel="Novo lançamento"
              onAction={onAdd}
            />
          </div>
        ) : (
          <>
            <Summary points={withData} loading={loading} />

            {/* Chart */}
            <section className={css({ mx: '5', md: { mx: '0', px: '6' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '4', pt: '6', pb: '3' })}>
              <MonthBarChart
                title={`Entradas e saídas por mês, últimos ${period} meses`}
                height={240}
                groups={points.map(p => ({
                  key: p.key,
                  label: MONTH_SHORT[p.month - 1],
                  bars: [
                    { value: p.income, tone: 'income' },
                    { value: p.expense, tone: 'expense', hatched: true },
                  ],
                  ariaLabel: `${MONTH_LONG[p.month - 1]} ${p.year}: entradas ${formatBRL(p.income)}, saídas ${formatBRL(p.expense)}`,
                }))}
                renderTooltip={i => {
                  const p = points[i]
                  return (
                    <>
                      <div className={css({ fontWeight: 'semibold', color: 'ink', mb: '1', textTransform: 'capitalize' })}>{MONTH_LONG[p.month - 1]} {p.year}</div>
                      <TooltipRow swatch={<Swatch tone="income" />} label="Entradas" value={formatBRL(p.income)} />
                      <TooltipRow swatch={<Swatch tone="expense" />} label="Saídas" value={formatBRL(p.expense)} />
                      <div className={css({ h: 'hairline', bg: 'border', my: '1' })} />
                      <TooltipRow label="Saldo" value={p.hasData ? formatDelta(p.net) : '—'} strong />
                    </>
                  )
                }}
              />
            </section>

            <MonthTable points={points} />
          </>
        )}

        <CardInsightsSection
          year={nav.year}
          month={nav.month}
          period={period}
          accountIds={account.ids}
          onOpenCard={onOpenCard}
        />
    </>
  )
}

function Summary({ points, loading }: { points: MonthPoint[]; loading: boolean }) {
  const n = points.length || 1
  const avgIn = points.reduce((s, p) => s + p.income, 0) / n
  const avgOut = points.reduce((s, p) => s + p.expense, 0) / n
  const best = points.reduce<MonthPoint | null>((b, p) => (!b || p.net > b.net ? p : b), null)

  const tiles = [
    { label: 'Entradas', value: formatBRL(Math.round(avgIn)), sub: 'média por mês' },
    { label: 'Saídas', value: formatBRL(Math.round(avgOut)), sub: 'média por mês' },
    {
      label: 'Melhor mês',
      value: best ? formatDelta(best.net) : '–',
      sub: best ? `${MONTH_LONG[best.month - 1]} ${best.year}` : '',
    },
  ]

  return (
    <div className={css({ mx: '5', md: { mx: '0' }, mt: '4', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', sm: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, gap: '3' })}>
      {tiles.map((t, i) => (
        <div
          key={t.label}
          className={css({ bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '4', py: '3.5' }, i === 2 ? { gridColumn: 'span 2 / span 2', sm: { gridColumn: 'span 1 / span 1' } } : {})}
        >
          <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted' })}>{t.label}</div>
          <div className={cx(css({ mt: '1', fontSize: '17', fontWeight: 'bold', color: 'ink', truncate: true }), 'nums')}>{loading ? '–' : t.value}</div>
          <div className={css({ fontSize: '12', color: 'muted', truncate: true })}>{t.sub}</div>
        </div>
      ))}
    </div>
  )
}

/** Table amounts drop the "R$" (stated once above the table) so four columns fit a phone */

/** Table view of the same data — newest month first, with totals */
function MonthTable({ points }: { points: MonthPoint[] }) {
  const rows = [...points].reverse()
  const total = points.reduce(
    (t, p) => ({ income: t.income + p.income, expense: t.expense + p.expense, net: t.net + p.net }),
    { income: 0, expense: 0, net: 0 },
  )

  return (
    <section className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', overflowX: 'auto' })}>
      <div className={css({ pl: '3', md: { pl: '5' }, pr: '3', pt: '3', fontSize: '11', color: 'muted' })}>Valores em R$</div>
      <table className={cx(css({ w: 'full', fontSize: '13', md: { fontSize: '14' }, borderCollapse: 'collapse' }), 'nums')}>
        <caption className={css({ srOnly: true })}>Entradas, saídas e saldo por mês, em reais</caption>
        <thead>
          <tr className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted' })}>
            <th scope="col" className={css({ textAlign: 'left', fontWeight: 'semibold', pl: '3', pr: '3', md: { px: '5' }, py: '3' })}>Mês</th>
            <th scope="col" className={css({ textAlign: 'right', fontWeight: 'semibold', px: '1.5', md: { px: '2' }, py: '3' })}>Entradas</th>
            <th scope="col" className={css({ textAlign: 'right', fontWeight: 'semibold', px: '1.5', md: { px: '2' }, py: '3' })}>Saídas</th>
            <th scope="col" className={css({ textAlign: 'right', fontWeight: 'semibold', pl: '3', pr: '3', md: { px: '5' }, py: '3' })}>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.key} className={css({ borderTopWidth: '1px', borderColor: 'border' })}>
              <th scope="row" className={css({ textAlign: 'left', fontWeight: 'medium', color: 'ink', pl: '3', pr: '3', md: { px: '5' }, py: '3', whiteSpace: 'nowrap' })}>
                <span className={css({ textTransform: 'capitalize' })}>{MONTH_SHORT[p.month - 1]}</span>
                <span className={css({ color: 'muted', fontWeight: 'normal' })}> {String(p.year).slice(2)}</span>
              </th>
              <td className={css({ textAlign: 'right', color: 'ink', px: '1.5', md: { px: '2' }, py: '3', whiteSpace: 'nowrap' })}>{p.hasData ? formatAmount(p.income) : '—'}</td>
              <td className={css({ textAlign: 'right', color: 'ink', px: '1.5', md: { px: '2' }, py: '3', whiteSpace: 'nowrap' })}>{p.hasData ? formatAmount(p.expense) : '—'}</td>
              <td className={cx(css({ textAlign: 'right', fontWeight: 'bold', pl: '3', pr: '3', md: { px: '5' }, py: '3', whiteSpace: 'nowrap' }), p.hasData ? toneClass(p.net) : css({ color: 'muted' }))}>
                {p.hasData ? formatAmountDelta(p.net) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={css({ borderTopWidth: '1px', borderColor: 'border', bg: 'bg/60' })}>
            <th scope="row" className={css({ textAlign: 'left', fontWeight: 'semibold', color: 'ink', pl: '3', pr: '3', md: { px: '5' }, py: '3' })}>Total</th>
            <td className={css({ textAlign: 'right', fontWeight: 'semibold', color: 'ink', px: '1.5', md: { px: '2' }, py: '3', whiteSpace: 'nowrap' })}>{formatAmount(total.income)}</td>
            <td className={css({ textAlign: 'right', fontWeight: 'semibold', color: 'ink', px: '1.5', md: { px: '2' }, py: '3', whiteSpace: 'nowrap' })}>{formatAmount(total.expense)}</td>
            <td className={cx(css({ textAlign: 'right', fontWeight: 'bold', pl: '3', pr: '3', md: { px: '5' }, py: '3', whiteSpace: 'nowrap' }), toneClass(total.net))}>{formatAmountDelta(total.net)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
