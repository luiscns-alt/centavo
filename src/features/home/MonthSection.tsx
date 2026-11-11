import { useMonthlyData, type CategorySummary, EvolutionCard } from '../analytics'
import { MonthSelector, type MonthNav } from '../../shared/ui/MonthSelector'
import { CategoryRow } from '../categories'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionLabel } from '../../shared/ui/SectionLabel'
import { PAYMENT_METHODS } from '../../core/constants/domain'
import type { PaymentMethod } from '../../core/types'
import { formatBRL, formatDelta, toneClass } from '../../shared/utils/money'
import { MONTH_LONG } from '../../shared/utils/dates'


interface Props {
  nav: MonthNav
  accountIds: number[] | null
  onAdd: () => void
  onOpenCompare: () => void
}

/**
 * Início, below the fold: the month picked in the selector — Saldo Livre (receitas − despesas),
 * patrimônio chart and the breakdowns. Loaded lazily (own chunk, mounted near the viewport).
 */
export default function MonthSection({ nav, accountIds, onAdd, onOpenCompare }: Props) {
  const { totalIncome, totalExpense, freeBalance, transfersIn, transfersOut, byCategory, byMethod, carry, loading } =
    useMonthlyData(nav.year, nav.month, accountIds)

  const balanceColor = freeBalance > 0 ? 'text-income' : freeBalance < 0 ? 'text-expense' : 'text-muted'
  const expenses = byCategory.filter(c => c.type === 'expense')
  const incomes  = byCategory.filter(c => c.type === 'income')
  const isEmpty  = !loading && byCategory.length === 0

  return (
    <div className="mt-10">
      <div className="px-5 md:px-0 flex items-center justify-between gap-3 mb-3">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[.1em] text-muted">O mês</h2>
        <MonthSelector {...nav} align="start" />
      </div>

      <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-6 lg:items-start">
        <div>
          <section className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl overflow-hidden">
            {carry === null ? (
              <div className="px-5 md:px-8 pt-6 pb-5 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2">Saldo livre</div>
                <div className={`text-[28px] font-bold leading-none nums ${loading ? 'text-muted opacity-30' : balanceColor}`}>
                  {loading ? '–' : formatBRL(freeBalance)}
                </div>
              </div>
            ) : (
              <CarriedBalance month={nav.month} carry={carry} result={freeBalance} loading={loading} />
            )}
            <div className="grid grid-cols-2 border-t border-border">
              <Summary label="Receitas" tone="income" value={loading ? '–' : formatBRL(totalIncome)} />
              <Summary label="Despesas" tone="expense" value={loading ? '–' : formatBRL(totalExpense)} divider />
            </div>
            {!loading && (totalIncome > 0 || totalExpense > 0) && (
              <SpendRatio income={totalIncome} expense={totalExpense} />
            )}
            {!loading && accountIds !== null && (transfersIn > 0 || transfersOut > 0) && (
              <div className="mx-5 md:mx-8 mb-4 flex items-center justify-between text-[12px]">
                <span className="text-muted">⇄ Transferências no mês</span>
                <span className="nums text-ink font-semibold">
                  {transfersIn > 0 && `+${formatBRL(transfersIn)}`}
                  {transfersIn > 0 && transfersOut > 0 && ' · '}
                  {transfersOut > 0 && `−${formatBRL(transfersOut)}`}
                </span>
              </div>
            )}
          </section>
          <EvolutionCard nav={nav} accountIds={accountIds} onOpenCompare={onOpenCompare} />
        </div>

        <section className="mt-6 lg:mt-0 px-5 md:px-6 md:py-5 md:bg-surface md:border md:border-border md:rounded-2xl">
          {isEmpty ? (
            <EmptyState
              title={`Nada em ${MONTH_LONG[nav.month - 1]} ainda`}
              description="Registre uma receita ou despesa e o resumo por categoria aparece aqui."
              actionLabel="Novo lançamento"
              onAction={onAdd}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <CategoryGroup title="Despesas por categoria" items={expenses} total={totalExpense} />
              <MethodGroup items={byMethod} total={totalExpense} />
              <CategoryGroup title="Receitas por categoria" items={incomes} total={totalIncome} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * All accounts: the month as a running total — what was left from earlier months, plus this month's
 * result. Spending a previous surplus no longer looks like a loss (DESIGN.md › Início › O mês).
 */
function CarriedBalance({ month, carry, result, loading }: { month: number; carry: number; result: number; loading: boolean }) {
  const total = carry + result
  const prev = MONTH_LONG[(month + 10) % 12]
  return (
    <div className="px-5 md:px-8 pt-6 pb-5 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2">Saldo de {MONTH_LONG[month - 1]}</div>
      <div className={`text-[28px] font-bold leading-none nums ${loading ? 'text-muted opacity-30' : toneClass(total)}`}>
        {loading ? '–' : formatBRL(total)}
      </div>
      {!loading && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] nums">
          <span className="text-muted">{carry < 0 ? 'Déficit' : 'Sobra'} de {prev} <span className={`font-semibold ${toneClass(carry)}`}>{formatDelta(carry)}</span></span>
          <span className="text-muted">Resultado do mês <span className={`font-semibold ${toneClass(result)}`}>{formatDelta(result)}</span></span>
        </div>
      )}
    </div>
  )
}

function Summary({ label, tone, value, divider = false }: {
  label: string; tone: 'income' | 'expense'; value: string; divider?: boolean
}) {
  return (
    <div className={`px-4 md:px-8 py-4 md:py-5 ${divider ? 'border-l border-border' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${tone === 'income' ? 'bg-income' : 'bg-expense'}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${tone === 'income' ? 'text-income' : 'text-expense'}`}>
          {label}
        </span>
      </div>
      <div className="text-[17px] font-bold nums text-ink truncate">{value}</div>
    </div>
  )
}

/** How much of the month's income the expenses consumed */
function SpendRatio({ income, expense }: { income: number; expense: number }) {
  const ratio = income > 0 ? expense / income : null
  const pct = ratio === null ? 100 : Math.round(ratio * 100)

  return (
    <div className="px-5 md:px-8 pt-4 pb-1 pb-4">
      <div className="h-1.5 rounded-full bg-income-light overflow-hidden">
        <div
          className="h-full rounded-full bg-expense bar-grow"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-[12px] text-muted mt-2 m-0">
        {ratio === null
          ? 'Nenhuma receita registrada neste mês.'
          : pct > 999
            ? <>Você gastou <span className="font-semibold text-ink nums">mais de 10×</span> o que recebeu.</>
            : <>Você gastou <span className="font-semibold text-ink nums">{pct}%</span> do que recebeu.</>}
      </p>
    </div>
  )
}

function CategoryGroup({ title, items, total }: { title: string; items: CategorySummary[]; total: number }) {
  if (items.length === 0) return null
  return (
    <div>
      <SectionLabel right={formatBRL(total)}>{title}</SectionLabel>
      <div className="divide-y divide-border">
        {items.map(({ category, total: t, type }, i) => (
          <CategoryRow
            key={category.id}
            index={i}
            icon={category.icon}
            name={category.name}
            type={type}
            amount={formatBRL(t)}
            share={total > 0 ? t / total : 0}
          />
        ))}
      </div>
    </div>
  )
}

const METHOD_ICON: Record<PaymentMethod | 'none', string> = {
  pix: '⚡', credit: '💳', debit: '🏧', boleto: '🧾', cash: '💵', ted: '🏦', none: '·',
}

/** Despesas por forma de pagamento — Pix × cartão × débito… */
function MethodGroup({ items, total }: { items: { method: PaymentMethod | 'none'; total: number }[]; total: number }) {
  if (items.length < 2 && items[0]?.method === 'none') return null
  if (items.length === 0) return null
  return (
    <div>
      <SectionLabel right={formatBRL(total)}>Despesas por forma de pagamento</SectionLabel>
      <div className="divide-y divide-border">
        {items.map(({ method, total: t }, i) => (
          <MethodRow
            key={method}
            index={i}
            icon={METHOD_ICON[method]}
            name={method === 'none' ? 'Não informado' : PAYMENT_METHODS[method]}
            amount={formatBRL(t)}
            share={total > 0 ? t / total : 0}
          />
        ))}
      </div>
    </div>
  )
}

/** Same layout as a category row, but neutral: a payment method has no income/expense side */
function MethodRow({ icon, name, amount, share, index }: { icon: string; name: string; amount: string; share: number; index: number }) {
  const pct = Math.round(share * 100)
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-9 h-9 rounded-[10px] border border-border bg-bg flex items-center justify-center text-[16px] shrink-0" aria-hidden>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium text-ink truncate">{name}</span>
          <span className="text-[15px] font-bold nums text-ink shrink-0">{amount}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
            <div className="h-full rounded-full bg-ink bar-grow" style={{ width: `${Math.max(pct, 2)}%`, animationDelay: `${index * 40}ms` }} />
          </div>
          <span className="text-[12px] text-muted nums w-9 text-right">{pct}%</span>
        </div>
      </div>
    </div>
  )
}
