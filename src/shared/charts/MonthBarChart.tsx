import { useId, useState, type ReactNode } from 'react'
import { barPath, formatAxis, niceTicks, useElementWidth } from './chartUtils'
import { HatchPattern } from './Swatch'
import { css, cva } from '../../../styled-system/css'

const NUMS = { fontVariantNumeric: 'tabular-nums lining-nums' } as const
const frame = css({ position: 'relative', w: 'full', userSelect: 'none' })
const svgBox = css({ display: 'block', overflow: 'visible' })
const gridLine = cva({ variants: { zero: { true: { stroke: 'muted' }, false: { stroke: 'border' } } } })
const axisText = css({ fill: 'muted', ...NUMS })
const columnHighlight = css({ fill: 'border' })
const barFill = cva({ variants: { tone: { income: { fill: 'income' }, expense: { fill: 'expense' } } } })
const monthText = cva({ variants: { dim: { true: { fill: 'muted' }, false: { fill: 'ink' } } } })
const calloutText = css({ fill: 'ink', ...NUMS })
const hitTarget = cva({ base: { outline: 'none' }, variants: { clickable: { true: { cursor: 'pointer' }, false: {} } } })
const tooltip = css({
  pointerEvents: 'none', position: 'absolute', zIndex: '10', w: '[220px]', bg: 'surface', borderWidth: '1px', borderColor: 'border',
  rounded: 'xl', shadow: 'lg', px: '3', py: '2.5', fontSize: '12',
})
const tooltipRow = css({ display: 'flex', alignItems: 'center', gap: '2', py: '0.5' })
const tooltipLabel = css({ color: 'muted' })
const tooltipValue = cva({
  base: { ml: 'auto', pl: '3', color: 'ink', ...NUMS },
  variants: { strong: { true: { fontWeight: 'bold' }, false: { fontWeight: 'semibold' } } },
})

export interface Bar {
  value: number // centavos, may be negative
  tone: 'income' | 'expense'
  /** Diagonal hatch — used for expense / negative values */
  hatched?: boolean
  /** Light tint of the tone — a secondary part of a stacked column */
  tint?: boolean
}

export interface BarGroup {
  key: string
  label: string
  bars: Bar[]
  /** De-emphasize (e.g. months other than the selected one) */
  dim?: boolean
  /** Stack the bars bottom → top in one column (positive values), split by surface hairlines */
  stacked?: boolean
  /** Accessible name for the month's hit area */
  ariaLabel: string
}

interface Props {
  groups: BarGroup[]
  height?: number
  /** Accessible summary of the whole chart */
  title: string
  renderTooltip: (index: number) => ReactNode
  onSelect?: (index: number) => void
  /** Direct label drawn above (or below) one group — selective, never on every bar */
  callout?: { index: number; text: string }
}

const M = { top: 22, right: 4, bottom: 26, left: 44 }
const GAP = 2 // surface gap between adjacent bars
const TOOLTIP_W = 220

export function MonthBarChart({ groups, height = 180, title, renderTooltip, onSelect, callout }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const hatchId = useId()

  const values = groups.flatMap(g => (g.stacked ? [g.bars.reduce((s, b) => s + Math.max(b.value, 0), 0)] : g.bars.map(b => b.value)))
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]

  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = height - M.top - M.bottom
  const y = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH
  const y0 = y(0)

  const band = groups.length ? innerW / groups.length : 0
  const perBar = groups[0]?.stacked ? 1 : (groups[0]?.bars.length ?? 1)
  const groupW = Math.min(band * 0.62, perBar * 26 + (perBar - 1) * GAP)
  const barW = (groupW - (perBar - 1) * GAP) / perBar
  const labelEvery = band < 30 ? 2 : 1
  const cx = (i: number) => M.left + band * i + band / 2

  return (
    <div ref={ref} className={frame} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={title} className={svgBox}>
          <defs><HatchPattern id={hatchId} /></defs>

          {/* Grid + y-axis labels (recessive) */}
          {ticks.map(t => (
            <g key={t}>
              <line
                x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)}
                className={gridLine({ zero: t === 0 })}
                strokeOpacity={t === 0 ? 0.45 : 1}
                strokeDasharray={t === 0 ? undefined : '2 3'}
              />
              <text
                x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end"
                className={axisText} fontSize="11"
              >
                {formatAxis(t)}
              </text>
            </g>
          ))}

          {groups.map((g, i) => {
            const x0 = cx(i) - groupW / 2
            const isActive = active === i
            return (
              <g key={g.key}>
                {isActive && (
                  <rect x={M.left + band * i + 1} y={M.top - 6} width={band - 2} height={innerH + 6} rx="6" className={columnHighlight} fillOpacity=".45" />
                )}
                {(g.stacked ? stackSegments(g.bars, y) : g.bars.map((b, j) => ({ b, x: x0 + j * (barW + GAP), from: y0, to: y(b.value), r: 4 })))
                  .map(({ b, x, from, to, r }, j) => {
                    const d = barPath(g.stacked ? x0 : x, barW, from, to, r)
                    if (!d) return null
                    return (
                      <path
                        key={j}
                        d={d}
                        className={b.hatched ? undefined : barFill({ tone: b.tone })}
                        fill={b.hatched ? `url(#${hatchId})` : undefined}
                        fillOpacity={b.tint ? 0.32 : undefined}
                        opacity={g.dim && !isActive ? 0.35 : 1}
                        style={{ transition: 'opacity 150ms' }}
                      />
                    )
                  })}
                {(groups.length - 1 - i) % labelEvery === 0 && (
                  <text
                    x={cx(i)} y={height - 8} textAnchor="middle" fontSize="11"
                    className={monthText({ dim: !!g.dim })}
                    fontWeight={g.dim ? 400 : 600}
                  >
                    {g.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Selective direct label */}
          {callout && groups[callout.index] && active === null && (() => {
            const cg = groups[callout.index]
            const top = cg.stacked
              ? y(cg.bars.reduce((s, b) => s + Math.max(b.value, 0), 0))
              : Math.min(...cg.bars.map(b => y(Math.max(b.value, 0))))
            const bottom = Math.max(...groups[callout.index].bars.map(b => y(Math.min(b.value, 0))))
            const neg = groups[callout.index].bars.every(b => b.value < 0)
            return (
              <text
                x={Math.min(Math.max(cx(callout.index), M.left + 30), width - 30)}
                y={neg ? bottom + 14 : top - 7}
                textAnchor="middle" fontSize="11" fontWeight="700"
                className={calloutText}
              >
                {callout.text}
              </text>
            )
          })()}

          {/* Hit targets: the whole month column, larger than the marks */}
          {groups.map((g, i) => (
            <rect
              key={g.key}
              x={M.left + band * i} y={M.top - 6} width={band} height={innerH + M.bottom + 6}
              fill="transparent"
              tabIndex={0}
              role={onSelect ? 'button' : undefined}
              aria-label={g.ariaLabel}
              className={hitTarget({ clickable: !!onSelect })}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => { setActive(i); onSelect?.(i) }}
              onKeyDown={e => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(i) }
              }}
            />
          ))}
        </svg>
      )}

      {/* Tooltip */}
      {active !== null && width > 0 && (
        <div
          className={tooltip}
          style={(() => {
            // Beside the hovered column, never on top of its bars; flip left near the right edge
            const right = cx(active) + band / 2 + 6
            const left = right + TOOLTIP_W <= width ? right : Math.max(0, cx(active) - band / 2 - 6 - TOOLTIP_W)
            return { left, top: M.top - 6 }
          })()}
          role="status"
        >
          {renderTooltip(active)}
        </div>
      )}
    </div>
  )
}

/** One line of a tooltip: key, label, value */
export function TooltipRow({ swatch, label, value, strong = false }: {
  swatch?: ReactNode; label: string; value: string; strong?: boolean
}) {
  return (
    <div className={tooltipRow}>
      {swatch}
      <span className={tooltipLabel}>{label}</span>
      <span className={tooltipValue({ strong })}>{value}</span>
    </div>
  )
}

/**
 * Segments of a stacked column, bottom → top. Each segment after the first starts GAP px higher
 * (a surface hairline between parts); only the topmost gets the rounded data end.
 */
function stackSegments(bars: Bar[], y: (v: number) => number) {
  const drawn = bars.filter(b => b.value > 0)
  let acc = 0
  return drawn.map((b, i) => {
    const from = y(acc) - (i > 0 ? GAP : 0)
    acc += b.value
    const to = y(acc)
    return { b, x: 0, from: Math.max(to, from), to, r: i === drawn.length - 1 ? 4 : 0 }
  })
}
