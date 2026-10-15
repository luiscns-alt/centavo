import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

interface MonthSelectorProps {
  year: number
  month: number // 1-12
  onPrev: () => void
  onNext: () => void
  /** Exibe label "MÊS ATUAL" acima quando true */
  showLabel?: boolean
  /** Adiciona borda inferior quando true */
  bordered?: boolean
}

export function MonthSelector({
  year,
  month,
  onPrev,
  onNext,
  showLabel = false,
  bordered = false,
}: MonthSelectorProps) {
  return (
    <div className={`flex items-center px-5 py-3 ${bordered ? 'border-b border-border' : ''}`}>
      <button
        onClick={onPrev}
        className="p-2 text-muted hover:text-ink transition-colors -ml-2"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={18} strokeWidth={1.5} />
      </button>

      <div className="flex-1 text-center">
        {showLabel && (
          <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted mb-0.5">
            Mês Atual
          </div>
        )}
        <div className="text-[15px] font-bold text-ink">
          {MONTH_NAMES[month - 1]} {year}
        </div>
      </div>

      <button
        onClick={onNext}
        className="p-2 text-muted hover:text-ink transition-colors -mr-2"
        aria-label="Próximo mês"
      >
        <ChevronRight size={18} strokeWidth={1.5} />
      </button>
    </div>
  )
}
