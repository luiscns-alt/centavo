import { ChevronLeft, ChevronRight } from 'lucide-react'
import { css, cva } from '../../../styled-system/css'
import { MONTH_LONG } from '../utils/dates'
import { monthIn } from './atoms'

const kicker = css({ fontSize: '10', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '0.5' })
const monthText = css({ fontSize: '15', fontWeight: 'semibold', color: 'ink', whiteSpace: 'nowrap' })
const monthName = css({ textTransform: 'capitalize' })
const yearText = css({ color: 'muted', fontWeight: 'medium' })
const todayButton = css({
  fontSize: '12', fontWeight: 'semibold', color: 'muted', px: '2.5', py: '1', rounded: 'full', borderWidth: '1px', borderColor: 'border',
  transitionProperty: 'colors', transitionDuration: 'normal', _hover: { color: 'ink', bg: 'bg' },
})
const arrowButton = css({
  w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted',
  transitionProperty: 'colors', transitionDuration: 'normal', _hover: { color: 'ink', bg: 'border/60' },
})
const bar = cva({
  base: { display: 'flex', alignItems: 'center' },
  variants: {
    align: { start: { gap: '1' }, center: { px: '3', py: '2' } },
    bordered: { true: { borderBottomWidth: '1px', borderColor: 'border' }, false: {} },
  },
})
const startLabel = css({ minW: '[150px]', textAlign: 'center' })
const centerLabel = css({ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2', textAlign: 'center' })


/** Month state + handlers, owned by App and shared by the month-based screens */
export interface MonthNav {
  year: number
  month: number // 1-12
  direction?: 'prev' | 'next'
  isCurrentMonth?: boolean
  onPrev: () => void
  onNext: () => void
  onToday?: () => void
  /** Jump straight to a month (e.g. clicking a chart bar) */
  onSelect?: (year: number, month: number) => void
}

interface MonthSelectorProps extends MonthNav {
  /** Exibe label "MÊS ATUAL" acima quando true */
  showLabel?: boolean
  /** Adiciona borda inferior quando true */
  bordered?: boolean
  /** Alinha o mês à esquerda (cabeçalho de página no desktop) */
  align?: 'center' | 'start'
}

export function MonthSelector({
  year,
  month,
  direction = 'next',
  isCurrentMonth = true,
  onPrev,
  onNext,
  onToday,
  showLabel = false,
  bordered = false,
  align = 'center',
}: MonthSelectorProps) {
  const label = (
    <div key={`${year}-${month}`} className={monthIn[direction]}>
      {showLabel && (
        <div className={kicker}>
          Mês Atual
        </div>
      )}
      <div className={monthText}>
        <span className={monthName}>{MONTH_LONG[month - 1]}</span> <span className={yearText}>{year}</span>
      </div>
    </div>
  )

  const today = onToday && !isCurrentMonth && (
    <button
      onClick={onToday}
      className={todayButton}
    >
      Hoje
    </button>
  )

  const arrow = (dir: 'prev' | 'next') => (
    <button
      onClick={dir === 'prev' ? onPrev : onNext}
      className={arrowButton}
      aria-label={dir === 'prev' ? 'Mês anterior' : 'Próximo mês'}
    >
      {dir === 'prev'
        ? <ChevronLeft size={18} strokeWidth={1.75} />
        : <ChevronRight size={18} strokeWidth={1.75} />}
    </button>
  )

  if (align === 'start') {
    return (
      <div className={bar({ align: 'start', bordered })}>
        {arrow('prev')}
        <div className={startLabel}>{label}</div>
        {arrow('next')}
        {today && <div className={css({ ml: '2' })}>{today}</div>}
      </div>
    )
  }

  return (
    <div className={bar({ align: 'center', bordered })}>
      {arrow('prev')}
      <div className={centerLabel}>
        {label}
        {today}
      </div>
      {arrow('next')}
    </div>
  )
}
