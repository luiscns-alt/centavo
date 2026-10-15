import { formatBRL, formatDate } from '../db'
import { useTransactionList } from '../hooks/useTransactionList'
import { MonthSelector } from './ui/MonthSelector'
import { TransactionRow } from './ui/TransactionRow'

const MONTH_NAMES_LC = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

interface Props {
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
}

export function TransactionList({ year, month, onPrev, onNext }: Props) {
  const { rows, loading } = useTransactionList(year, month)

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">

      {/* Mobile-only header */}
      <div className="md:hidden flex justify-between items-center px-5 pt-5 pb-0">
        <span className="text-[17px] font-semibold text-ink">centavo</span>
        <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-[11px] font-semibold text-muted">
          LC
        </div>
      </div>

      {/* Month selector */}
      <MonthSelector
        year={year}
        month={month}
        onPrev={onPrev}
        onNext={onNext}
        bordered
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 pt-4 pb-24 md:pb-8 md:max-w-2xl">
        <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-1">
          Lançamentos
        </div>

        {loading && (
          <div className="py-16 text-center text-muted opacity-30 text-[14px]">-</div>
        )}

        {loading === false && rows.length === 0 && (
          <div className="text-[14px] text-muted text-center py-16">
            Nenhum lançamento em {MONTH_NAMES_LC[month - 1]}.
          </div>
        )}

        {rows.map(({ tx, category }) => (
          <TransactionRow
            key={tx.id}
            icon={category.icon}
            type={category.type}
            title={tx.description || category.name}
            subtitle={`${category.name} · ${formatDate(tx.date)}`}
            amount={formatBRL(tx.amount)}
          />
        ))}
      </div>
    </div>
  )
}
