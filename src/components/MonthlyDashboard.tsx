import { formatBRL } from '../db'
import { useMonthlyData } from '../hooks/useMonthlyData'
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

export function MonthlyDashboard({ year, month, onPrev, onNext }: Props) {
  const { totalIncome, totalExpense, freeBalance, byCategory, loading } = useMonthlyData(year, month)

  const balanceColor =
    freeBalance > 0 ? 'text-income' :
    freeBalance < 0 ? 'text-expense' :
    'text-muted'

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-bg overflow-hidden">

      {/* ── Left panel: hero ── */}
      <div className="md:w-[380px] md:shrink-0 md:border-r border-border flex flex-col md:overflow-y-auto">

        {/* Mobile-only header */}
        <div className="md:hidden flex justify-between items-center px-5 pt-5 pb-0">
          <span className="text-[17px] font-semibold text-ink">centavo</span>
          <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-[11px] font-semibold text-muted">
            LC
          </div>
        </div>

        {/* Month selector */}
        <MonthSelector year={year} month={month} onPrev={onPrev} onNext={onNext} />

        {/* Hero: Saldo Livre */}
        <div
          className="px-5 md:px-8 pt-4 pb-8 text-center border-b border-border"
          style={{ filter: 'url(#paper-grain)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2">
            Saldo Livre
          </div>
          {loading ? (
            <div className="font-serif text-[44px] md:text-[52px] text-muted opacity-30">-</div>
          ) : (
            <div className={`font-serif text-[44px] md:text-[52px] leading-none nums ${balanceColor}`}>
              {formatBRL(freeBalance)}
            </div>
          )}
        </div>

        {/* Income / Expense summary */}
        <div className="grid grid-cols-2">
          <div className="px-5 md:px-8 py-5 border-r border-border">
            <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-income mb-1">
              Receitas
            </div>
            <div className="text-[15px] font-bold nums text-ink">
              {loading ? '-' : formatBRL(totalIncome)}
            </div>
          </div>
          <div className="px-5 md:px-8 py-5">
            <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-expense mb-1">
              Despesas
            </div>
            <div className="text-[15px] font-bold nums text-ink">
              {loading ? '-' : formatBRL(totalExpense)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: category breakdown ── */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 pt-5 pb-24 md:pb-8">
        <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted mb-2">
          Por categoria
        </div>

        {byCategory.length === 0 && loading === false && (
          <div className="text-[14px] text-muted text-center py-16">
            Nenhum lançamento em {MONTH_NAMES_LC[month - 1]}.
          </div>
        )}

        {byCategory.map(({ category, total, type }) => (
          <TransactionRow
            key={category.id}
            icon={category.icon}
            type={type}
            title={category.name}
            amount={formatBRL(total)}
          />
        ))}
      </div>

    </div>
  )
}
