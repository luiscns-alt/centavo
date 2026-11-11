import { useEffect, useState } from 'react'
import { HomeScreen } from '../features/home'
import { TransactionList, AddTransactionForm, type EditTarget } from '../features/transactions'
import { Settings } from '../features/settings'
import { Analyses } from '../features/analytics'
import { CardView } from '../features/credit-cards'
import { LoanView, LoanForm } from '../features/loans'
import { SideNav } from './SideNav'
import { BottomNav } from './BottomNav'
import { BudgetToaster } from '../features/budgets'
import type { MonthNav } from '../shared/ui/MonthSelector'
import type { AccountScope } from '../features/accounts'
import type { Tab } from './nav'
import type { AnalysisView } from '../features/analytics'
import { useAccounts, resolveSelection } from '../features/accounts'

const ACCOUNT_FILTER_KEY = 'centavo:accountFilter'
const ANALYSIS_VIEW_KEY = 'centavo:analysisView'

function readAnalysisView(): AnalysisView {
  try { return localStorage.getItem(ANALYSIS_VIEW_KEY) === 'budgets' ? 'budgets' : 'compare' } catch { return 'compare' }
}

function readAccountFilter(): string {
  try {
    const v = localStorage.getItem(ACCOUNT_FILTER_KEY) ?? ''
    // Before cards, the filter stored a bare account id
    return /^\d+$/.test(v) ? `a:${v}` : v
  } catch { return '' }
}

function getCurrentMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Screens that aren't nav tabs: a card's invoices, and editing an existing entry */
type Overlay =
  | { kind: 'card'; id: number; back: Tab }
  | { kind: 'loan'; id: number; back: Tab }
  | { kind: 'loan-new'; back: Tab }
  | { kind: 'edit'; target: EditTarget; back: Tab }
  | null

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [{ year, month }, setMonth] = useState(getCurrentMonth)
  const [direction, setDirection] = useState<'prev' | 'next'>('next')
  const [selection, setSelectionState] = useState<string>(readAccountFilter)
  /** Mode a new entry opens in (Início shortcuts); undefined = the form's default */
  const [addMode, setAddMode] = useState<'expense' | 'income' | 'transfer' | undefined>(undefined)
  const [analysisView, setAnalysisViewState] = useState<AnalysisView>(readAnalysisView)
  const accounts = useAccounts()

  function setAnalysisView(v: AnalysisView) {
    setAnalysisViewState(v)
    try { localStorage.setItem(ANALYSIS_VIEW_KEY, v) } catch { /* private mode — not remembered */ }
  }

  // A filter pointing at a deleted account resolves to "all"
  const ids = accounts ? resolveSelection(selection, accounts) : null

  function setSelection(s: string) {
    setSelectionState(s)
    try {
      if (s === '') localStorage.removeItem(ACCOUNT_FILTER_KEY)
      else localStorage.setItem(ACCOUNT_FILTER_KEY, s)
    } catch { /* private mode — filter not remembered */ }
  }
  const account: AccountScope = { selection: ids === null ? '' : selection, ids, setSelection }

  const current = getCurrentMonth()
  const isCurrentMonth = year === current.year && month === current.month

  function go(next: Tab) {
    setOverlay(null)
    if (next === 'add') setAddMode(undefined)
    setTab(next)
  }

  // Desktop shortcut: "N" opens the form (ignored while typing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setOverlay(null); setAddMode(undefined); setTab('add') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const nav: MonthNav = {
    year,
    month,
    direction,
    isCurrentMonth,
    onPrev() {
      setDirection('prev')
      setMonth(({ year, month }) =>
        month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })
    },
    onNext() {
      setDirection('next')
      setMonth(({ year, month }) =>
        month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 })
    },
    onSelect(y, m) {
      if (y === year && m === month) return
      setDirection(y * 12 + m > year * 12 + month ? 'next' : 'prev')
      setMonth({ year: y, month: m })
    },
    onToday() {
      setDirection(year * 12 + month > current.year * 12 + current.month ? 'prev' : 'next')
      setMonth(getCurrentMonth())
    },
  }

  const goAdd = (mode?: 'expense' | 'income' | 'transfer') => { go('add'); setAddMode(mode) }
  const openCard = (id: number) => setOverlay({ kind: 'card', id, back: tab })
  const openLoan = (id: number) => setOverlay({ kind: 'loan', id, back: tab })
  const newLoan = () => setOverlay({ kind: 'loan-new', back: tab })
  const openEdit = (target: EditTarget) => setOverlay({ kind: 'edit', target, back: overlay?.kind === 'card' ? tab : tab })
  const closeOverlay = () => setOverlay(o => (o?.kind === 'edit' && o.target.returnToCard ? { kind: 'card', id: o.target.returnToCard, back: o.back } : null))

  // A single selected account (not a bank group) becomes the form's default account
  const defaultAccountId = ids?.length === 1 ? ids[0] : null
  const activeTab: Tab = overlay ? overlay.back : tab

  return (
    <div className="flex min-h-svh">
      <SideNav active={activeTab} onChange={go} />

      <main className="flex-1 flex flex-col min-h-svh min-w-0">
        {overlay?.kind === 'card' && (
          <CardView cardId={overlay.id} onBack={() => setOverlay(null)} onEdit={t => openEdit({ ...t, returnToCard: overlay.id })} />
        )}
        {overlay?.kind === 'loan' && <LoanView loanId={overlay.id} onBack={() => setOverlay(null)} />}
        {overlay?.kind === 'loan-new' && (
          <LoanForm onCreated={id => setOverlay({ kind: 'loan', id, back: overlay.back })} onCancel={() => setOverlay(null)} />
        )}
        {overlay?.kind === 'edit' && (
          <AddTransactionForm key={JSON.stringify(overlay.target)} edit={overlay.target} onSaved={closeOverlay} onCancel={closeOverlay} />
        )}
        {!overlay && tab === 'home' && (
          <HomeScreen
            nav={nav}
            account={account}
            onAdd={goAdd}
            onOpenCompare={() => { setAnalysisView('compare'); go('compare') }}
            onOpenBudgets={() => { setAnalysisView('budgets'); go('compare') }}
            onManageAccounts={() => go('settings')}
            onOpenCard={openCard}
            onOpenLoan={openLoan}
          />
        )}
        {!overlay && tab === 'compare' && (
          <Analyses view={analysisView} onView={setAnalysisView} nav={nav} account={account} onAdd={goAdd} onOpenCard={openCard} />
        )}
        {!overlay && tab === 'transactions' && (
          <TransactionList nav={nav} account={account} onAdd={goAdd} onEdit={openEdit} onOpenCard={openCard} onOpenLoan={openLoan} />
        )}
        {!overlay && tab === 'add' && (
          <AddTransactionForm
            key={addMode ?? 'default'}
            startMode={addMode}
            defaultAccountId={defaultAccountId}
            onSaved={() => go('home')}
            onCancel={() => go('home')}
          />
        )}
        {!overlay && tab === 'settings' && <Settings onOpenLoan={openLoan} onNewLoan={newLoan} />}
      </main>

      <BudgetToaster onOpen={() => { setAnalysisView('budgets'); go('compare') }} />

      {/* Mobile bottom nav — hidden on desktop and while a form is open */}
      {tab !== 'add' && overlay?.kind !== 'edit' && <BottomNav active={activeTab} onChange={go} />}
    </div>
  )
}
