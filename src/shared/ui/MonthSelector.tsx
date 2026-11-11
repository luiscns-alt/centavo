import { MONTH_LONG } from '../utils/dates'
import { ChevronLeft, ChevronRight } from 'lucide-react'


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
    <div key={`${year}-${month}`} className={direction === 'next' ? 'month-in-next' : 'month-in-prev'}>
      {showLabel && (
        <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted mb-0.5">
          Mês Atual
        </div>
      )}
      <div className="text-[15px] font-semibold text-ink whitespace-nowrap">
        <span className="capitalize">{MONTH_LONG[month - 1]}</span> <span className="text-muted font-medium">{year}</span>
      </div>
    </div>
  )

  const today = onToday && !isCurrentMonth && (
    <button
      onClick={onToday}
      className="text-[12px] font-semibold text-muted hover:text-ink px-2.5 py-1 rounded-full border border-border hover:bg-bg transition-colors"
    >
      Hoje
    </button>
  )

  const arrow = (dir: 'prev' | 'next') => (
    <button
      onClick={dir === 'prev' ? onPrev : onNext}
      className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-border/60 transition-colors"
      aria-label={dir === 'prev' ? 'Mês anterior' : 'Próximo mês'}
    >
      {dir === 'prev'
        ? <ChevronLeft size={18} strokeWidth={1.75} />
        : <ChevronRight size={18} strokeWidth={1.75} />}
    </button>
  )

  if (align === 'start') {
    return (
      <div className={`flex items-center gap-1 ${bordered ? 'border-b border-border' : ''}`}>
        {arrow('prev')}
        <div className="min-w-[150px] text-center">{label}</div>
        {arrow('next')}
        {today && <div className="ml-2">{today}</div>}
      </div>
    )
  }

  return (
    <div className={`flex items-center px-3 py-2 ${bordered ? 'border-b border-border' : ''}`}>
      {arrow('prev')}
      <div className="flex-1 flex items-center justify-center gap-2 text-center">
        {label}
        {today}
      </div>
      {arrow('next')}
    </div>
  )
}
