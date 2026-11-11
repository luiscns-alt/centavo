import { lazy, Suspense } from 'react'
import { AlertTriangle, ArrowLeftRight, ChevronRight, Clock, CreditCard, Minus, OctagonAlert, Plus } from 'lucide-react'
import type { HomeAlert, HomeSummary } from './home'
import { useHomeSummary } from './useHomeSummary'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import { AccountFilter, type AccountScope, AccountIcon, AccountsCard } from '../accounts'
import { LazyMount } from '../../shared/ui/LazyMount'
import { MobileHeader } from '../../shared/ui/MobileHeader'
import { BudgetHomeCard } from '../budgets'
import { todayISO, formatDayMonth, formatMonthName } from '../../shared/utils/dates'
import { formatBRL, formatBalance } from '../../shared/utils/money'

const MonthSection = lazy(() => import('./MonthSection'))


export type QuickAction = 'expense' | 'income' | 'transfer'

interface Props {
  nav: MonthNav
  account: AccountScope
  onAdd: (mode?: QuickAction) => void
  onOpenCompare: () => void
  onOpenBudgets: () => void
  onManageAccounts: () => void
  onOpenCard: (id: number) => void
  onOpenLoan: (id: number) => void
}

/**
 * Início — "how am I doing today". Above the fold everything is about today and comes from one
 * consistent read (useHomeSummary); below the fold, the month in the selector, loaded lazily.
 */
export function HomeScreen({ nav, account, onAdd, onOpenCompare, onOpenBudgets, onManageAccounts, onOpenCard, onOpenLoan }: Props) {
  const { data, stale } = useHomeSummary(account.ids)

  function openAlert(a: HomeAlert) {
    const t = a.target
    if (t.screen === 'card') onOpenCard(t.id)
    else if (t.screen === 'loan') onOpenLoan(t.id)
    else if (t.screen === 'budgets') onOpenBudgets()
    else onManageAccounts()
  }

  // "Pagar fatura" only when an invoice is overdue or due within the alert window
  const payCard = data?.alerts.find(a => a.kind === 'invoice_overdue' || a.kind === 'invoice_due')

  return (
    <div className="flex-1 overflow-y-auto pb-28 md:pb-12">
      <MobileHeader />

      <div className="md:max-w-[560px] lg:max-w-[1040px] md:mx-auto md:px-10 md:pt-8">
        <div className="hidden md:flex items-center gap-3 mb-6">
          <h1 className="text-[22px] font-semibold tracking-[-.01em] text-ink m-0">Início</h1>
          <AccountFilter value={account.selection} onChange={account.setSelection} />
        </div>
        <div className="md:hidden flex justify-center empty:hidden pb-1">
          <AccountFilter value={account.selection} onChange={account.setSelection} />
        </div>

        <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:gap-6 lg:items-start">
          {/* ── Left: hero, actions, attention, cards ── */}
          <div className="flex flex-col gap-4 md:gap-5">
            <Hero data={data} stale={stale} />
            <QuickActions onAdd={onAdd} pay={payCard?.target.screen === 'card' ? () => onOpenCard((payCard.target as { id: number }).id) : null} />
            {data && <Attention alerts={data.alerts} onOpen={openAlert} />}
            {data && data.cards.items.length > 0 && <CardsBlock cards={data.cards} onOpen={onOpenCard} />}
          </div>

          {/* ── Right: budgets, accounts and loans ── */}
          <div className="mt-4 md:mt-5 lg:mt-0 flex flex-col gap-4 md:gap-5">
            {data && <BudgetHomeCard budgets={data.budgets} onOpen={onOpenBudgets} />}
            {/* Metas: a block reserved here once goals exist (data.goals) */}
            {data && <AccountsCard
              asOf={todayISO()}
              balances={data.balances}
              account={account}
              showCards={false}
              onManage={onManageAccounts}
              onOpenCard={onOpenCard}
              onOpenLoan={onOpenLoan}
            />}
          </div>
        </div>

        {/* ── Below the fold: the selected month ── */}
        <LazyMount minHeight={600}>
          <Suspense fallback={<div className="h-[600px]" />}>
            <MonthSection nav={nav} accountIds={account.ids} onAdd={() => onAdd()} onOpenCompare={onOpenCompare} />
          </Suspense>
        </LazyMount>
      </div>
    </div>
  )
}

function Hero({ data, stale }: { data?: HomeSummary; stale: boolean }) {
  const loading = !data
  const total = data?.available.total ?? 0
  const free = data?.outlook.projectedFree ?? 0
  const due = data?.outlook.dueThisMonth
  const parts = due ? [
    due.invoices > 0 ? `faturas ${formatBRL(due.invoices)}` : null,
    due.loans > 0 ? `parcelas ${formatBRL(due.loans)}` : null,
  ].filter(Boolean) : []
  const month = data ? formatMonthName(data.month) : ''

  return (
    <section className="md:bg-surface md:border md:border-border md:rounded-2xl" aria-busy={loading || stale}>
      <div className="px-5 md:px-8 pt-5 md:pt-8 pb-5 md:pb-7 text-center" style={{ filter: 'url(#paper-grain)' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-3">Disponível hoje</div>
        <div className={`font-serif text-[44px] md:text-[52px] leading-none nums ${loading ? 'text-muted opacity-30' : total < 0 ? 'text-expense' : 'text-ink'}`}>
          {loading ? '–' : formatBalance(total)}
        </div>
        {data && (
          <div className="mt-4 text-[13px] nums">
            <span className="text-muted">Sobra prevista em {month}: </span>
            <span className={`font-semibold ${free < 0 ? 'text-expense' : 'text-ink'}`}>{formatBalance(free)}</span>
            {parts.length > 0 && <div className="text-[12px] text-muted mt-0.5">depois de {parts.join(' e ')}</div>}
          </div>
        )}
      </div>
    </section>
  )
}

function QuickActions({ onAdd, pay }: { onAdd: (mode?: QuickAction) => void; pay: (() => void) | null }) {
  const actions = [
    { id: 'expense' as const, label: 'Despesa', Icon: Minus },
    { id: 'income' as const, label: 'Receita', Icon: Plus },
    { id: 'transfer' as const, label: 'Transferir', Icon: ArrowLeftRight },
  ]
  return (
    <div className={`mx-5 md:mx-0 grid ${pay ? 'grid-cols-4' : 'grid-cols-3'} gap-2`} role="group" aria-label="Atalhos">
      {actions.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onAdd(id)}
          className="h-[68px] rounded-2xl bg-surface border border-border flex flex-col items-center justify-center gap-1.5 text-[12px] font-semibold text-ink hover:bg-bg transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-border/70 flex items-center justify-center" aria-hidden><Icon size={15} strokeWidth={2} /></span>
          {label}
        </button>
      ))}
      {pay && (
        <button
          onClick={pay}
          className="h-[68px] rounded-2xl bg-ink text-bg flex flex-col items-center justify-center gap-1.5 text-[12px] font-semibold hover:opacity-90 transition-opacity"
        >
          <span className="w-7 h-7 rounded-full bg-bg/15 flex items-center justify-center" aria-hidden><CreditCard size={15} strokeWidth={2} /></span>
          Pagar fatura
        </button>
      )}
    </div>
  )
}

const ALERT_ICON: Record<HomeAlert['kind'], typeof Clock> = {
  invoice_overdue: OctagonAlert, loan_overdue: OctagonAlert, account_negative: OctagonAlert,
  budget_over: OctagonAlert, invoice_due: Clock, budget_warning: AlertTriangle,
}

function Attention({ alerts, onOpen }: { alerts: HomeAlert[]; onOpen: (a: HomeAlert) => void }) {
  if (alerts.length === 0) {
    return <p className="mx-5 md:mx-0 my-0 text-[13px] text-muted text-center">Tudo em dia — nada vencido nem estourado.</p>
  }
  const shown = alerts.slice(0, 3)
  return (
    <section className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl" aria-label="Atenção">
      <div className="px-5 md:px-6 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Atenção</div>
      <ul className="m-0 p-0 list-none px-2 md:px-3 pb-2">
        {shown.map((a, i) => {
          const Icon = ALERT_ICON[a.kind]
          const strong = a.severity >= 3
          return (
            <li key={i}>
              <button onClick={() => onOpen(a)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-bg/60 transition-colors">
                <Icon size={16} strokeWidth={2} className={`shrink-0 ${strong ? 'text-expense' : 'text-ink'}`} aria-hidden />
                <span className={`flex-1 min-w-0 text-[14px] leading-snug ${strong ? 'text-expense font-semibold' : 'text-ink font-medium'}`}>{a.title}</span>
                <span className="text-[13px] font-semibold nums text-ink shrink-0">{formatBRL(a.amount)}</span>
                <ChevronRight size={15} strokeWidth={1.75} className="text-muted shrink-0" />
              </button>
            </li>
          )
        })}
      </ul>
      {alerts.length > 3 && <p className="px-5 md:px-6 pb-3 m-0 text-[12px] text-muted">e mais {alerts.length - 3}</p>}
    </section>
  )
}

function CardsBlock({ cards, onOpen }: { cards: HomeSummary['cards']; onOpen: (id: number) => void }) {
  return (
    <section className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl">
      <div className="flex items-baseline justify-between gap-3 px-5 md:px-6 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Cartões</div>
        <div className="text-[12px] text-muted nums"><span className="font-semibold text-ink">{formatBRL(cards.toPay)}</span> a pagar</div>
      </div>
      <ul className="m-0 p-0 list-none mt-2 px-2 md:px-3 pb-2">
        {cards.items.map(c => (
          <li key={c.id}>
            <button onClick={() => onOpen(c.id)} className="w-full flex items-center gap-3 px-3 h-14 rounded-xl text-left hover:bg-bg/60 transition-colors">
              <AccountIcon account={c} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium text-ink truncate">{c.name}</div>
                <div className={`text-[12px] truncate nums ${c.overdue ? 'text-expense font-semibold' : 'text-muted'}`}>
                  {c.remaining > 0 ? `${c.overdue ? 'Venceu' : 'Vence'} ${formatDayMonth(c.dueDate)}` : 'Nada a pagar agora'}
                  {c.available != null && ` · disp. ${formatBalance(c.available)}`}
                </div>
              </div>
              <div className="text-[15px] font-bold nums shrink-0 text-ink">{formatBRL(c.remaining)}</div>
              <ChevronRight size={16} strokeWidth={1.75} className="text-muted shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
