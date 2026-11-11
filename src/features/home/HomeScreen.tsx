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
import { css, cx } from '../../../styled-system/css'

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
    <div className={css({ flex: '1', overflowY: 'auto', pb: '28', md: { pb: '12' } })}>
      <MobileHeader />

      <div className={css({ md: { maxW: '[560px]', mx: 'auto', px: '10', pt: '8' }, lg: { maxW: '[1040px]' } })}>
        <div className={css({ display: 'none', md: { display: 'flex' }, alignItems: 'center', gap: '3', mb: '6' })}>
          <h1 className={css({ fontSize: '22', fontWeight: 'semibold', letterSpacing: 'title', color: 'ink', m: '0' })}>Início</h1>
          <AccountFilter value={account.selection} onChange={account.setSelection} />
        </div>
        <div className={css({ md: { display: 'none' }, display: 'flex', justifyContent: 'center', _empty: { display: 'none' }, pb: '1' })}>
          <AccountFilter value={account.selection} onChange={account.setSelection} />
        </div>

        <div className={css({ lg: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6', alignItems: 'flex-start' } })}>
          {/* ── Left: hero, actions, attention, cards ── */}
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '4', md: { gap: '5' } })}>
            <Hero data={data} stale={stale} />
            <QuickActions onAdd={onAdd} pay={payCard?.target.screen === 'card' ? () => onOpenCard((payCard.target as { id: number }).id) : null} />
            {data && <Attention alerts={data.alerts} onOpen={openAlert} />}
            {data && data.cards.items.length > 0 && <CardsBlock cards={data.cards} onOpen={onOpenCard} />}
          </div>

          {/* ── Right: budgets, accounts and loans ── */}
          <div className={css({ mt: '4', md: { mt: '5', gap: '5' }, lg: { mt: '0' }, display: 'flex', flexDirection: 'column', gap: '4' })}>
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
          <Suspense fallback={<div className={css({ h: '[600px]' })} />}>
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
    <section className={css({ md: { bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' } })} aria-busy={loading || stale}>
      <div className={css({ px: '5', md: { px: '8', pt: '8', pb: '7' }, pt: '5', pb: '5', textAlign: 'center' })} style={{ filter: 'url(#paper-grain)' }}>
        <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '3' })}>Disponível hoje</div>
        <div className={cx(css({ fontFamily: 'serif', fontSize: '44', md: { fontSize: '52' }, lineHeight: 'none' }, loading ? { color: 'muted', opacity: '0.3' } : total < 0 ? { color: 'expense' } : { color: 'ink' }), 'nums')}>
          {loading ? '–' : formatBalance(total)}
        </div>
        {data && (
          <div className={cx(css({ mt: '4', fontSize: '13' }), 'nums')}>
            <span className={css({ color: 'muted' })}>Sobra prevista em {month}: </span>
            <span className={css({ fontWeight: 'semibold' }, free < 0 ? { color: 'expense' } : { color: 'ink' })}>{formatBalance(free)}</span>
            {parts.length > 0 && <div className={css({ fontSize: '12', color: 'muted', mt: '0.5' })}>depois de {parts.join(' e ')}</div>}
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
    <div className={css({ mx: '5', md: { mx: '0' }, display: 'grid' }, pay ? { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' } : { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, { gap: '2' })} role="group" aria-label="Atalhos">
      {actions.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onAdd(id)}
          className={css({ h: '[68px]', rounded: '2xl', bg: 'surface', borderWidth: '1px', borderColor: 'border', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5', fontSize: '12', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' }, transition: 'colors' })}
        >
          <span className={css({ w: '7', h: '7', rounded: 'full', bg: 'border/70', display: 'flex', alignItems: 'center', justifyContent: 'center' })} aria-hidden><Icon size={15} strokeWidth={2} /></span>
          {label}
        </button>
      ))}
      {pay && (
        <button
          onClick={pay}
          className={css({ h: '[68px]', rounded: '2xl', bg: 'ink', color: 'bg', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5', fontSize: '12', fontWeight: 'semibold', _hover: { opacity: '0.9' }, transition: 'opacity' })}
        >
          <span className={css({ w: '7', h: '7', rounded: 'full', bg: 'bg/15', display: 'flex', alignItems: 'center', justifyContent: 'center' })} aria-hidden><CreditCard size={15} strokeWidth={2} /></span>
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
    return <p className={css({ mx: '5', md: { mx: '0' }, my: '0', fontSize: '13', color: 'muted', textAlign: 'center' })}>Tudo em dia — nada vencido nem estourado.</p>
  }
  const shown = alerts.slice(0, 3)
  return (
    <section className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' })} aria-label="Atenção">
      <div className={css({ px: '5', md: { px: '6' }, pt: '4', pb: '1', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Atenção</div>
      <ul className={css({ m: '0', p: '0', listStyle: 'none', px: '2', md: { px: '3' }, pb: '2' })}>
        {shown.map((a, i) => {
          const Icon = ALERT_ICON[a.kind]
          const strong = a.severity >= 3
          return (
            <li key={i}>
              <button onClick={() => onOpen(a)} className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '3', px: '3', py: '2.5', rounded: 'xl', textAlign: 'left', _hover: { bg: 'bg/60' }, transition: 'colors' })}>
                <Icon size={16} strokeWidth={2} className={css({ flexShrink: '0' }, strong ? { color: 'expense' } : { color: 'ink' })} aria-hidden />
                <span className={css({ flex: '1', minW: '0', fontSize: '14', lineHeight: 'snug' }, strong ? { color: 'expense', fontWeight: 'semibold' } : { color: 'ink', fontWeight: 'medium' })}>{a.title}</span>
                <span className={cx(css({ fontSize: '13', fontWeight: 'semibold', color: 'ink', flexShrink: '0' }), 'nums')}>{formatBRL(a.amount)}</span>
                <ChevronRight size={15} strokeWidth={1.75} className={css({ color: 'muted', flexShrink: '0' })} />
              </button>
            </li>
          )
        })}
      </ul>
      {alerts.length > 3 && <p className={css({ px: '5', md: { px: '6' }, pb: '3', m: '0', fontSize: '12', color: 'muted' })}>e mais {alerts.length - 3}</p>}
    </section>
  )
}

function CardsBlock({ cards, onOpen }: { cards: HomeSummary['cards']; onOpen: (id: number) => void }) {
  return (
    <section className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' })}>
      <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3', px: '5', md: { px: '6' }, pt: '5' })}>
        <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Cartões</div>
        <div className={cx(css({ fontSize: '12', color: 'muted' }), 'nums')}><span className={css({ fontWeight: 'semibold', color: 'ink' })}>{formatBRL(cards.toPay)}</span> a pagar</div>
      </div>
      <ul className={css({ m: '0', p: '0', listStyle: 'none', mt: '2', px: '2', md: { px: '3' }, pb: '2' })}>
        {cards.items.map(c => (
          <li key={c.id}>
            <button onClick={() => onOpen(c.id)} className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '3', px: '3', h: '14', rounded: 'xl', textAlign: 'left', _hover: { bg: 'bg/60' }, transition: 'colors' })}>
              <AccountIcon account={c} />
              <div className={css({ flex: '1', minW: '0' })}>
                <div className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{c.name}</div>
                <div className={cx(css({ fontSize: '12', truncate: true }, c.overdue ? { color: 'expense', fontWeight: 'semibold' } : { color: 'muted' }), 'nums')}>
                  {c.remaining > 0 ? `${c.overdue ? 'Venceu' : 'Vence'} ${formatDayMonth(c.dueDate)}` : 'Nada a pagar agora'}
                  {c.available != null && ` · disp. ${formatBalance(c.available)}`}
                </div>
              </div>
              <div className={cx(css({ fontSize: '15', fontWeight: 'bold', flexShrink: '0', color: 'ink' }), 'nums')}>{formatBRL(c.remaining)}</div>
              <ChevronRight size={16} strokeWidth={1.75} className={css({ color: 'muted', flexShrink: '0' })} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
