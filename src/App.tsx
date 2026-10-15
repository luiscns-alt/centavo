import { useState } from 'react'
import { MonthlyDashboard } from './components/MonthlyDashboard'
import { TransactionList } from './components/TransactionList'
import { AddTransactionForm } from './components/AddTransactionForm'
import { Settings } from './components/Settings'
import { SideNav } from './components/SideNav'
import { BottomNav } from './components/BottomNav'

type Tab = 'home' | 'transactions' | 'add' | 'settings'

function getInitialMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [{ year, month }, setMonth] = useState(getInitialMonth)

  function prevMonth() {
    setMonth(({ year, month }) =>
      month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    )
  }

  function nextMonth() {
    setMonth(({ year, month }) =>
      month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
    )
  }

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar — hidden on mobile */}
      <SideNav active={tab} onChange={setTab} />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-svh overflow-hidden">
        {tab === 'home' && (
          <MonthlyDashboard year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />
        )}
        {tab === 'transactions' && (
          <TransactionList year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />
        )}
        {tab === 'add' && (
          <AddTransactionForm onSaved={() => setTab('home')} onCancel={() => setTab('home')} />
        )}
        {tab === 'settings' && (
          <Settings />
        )}
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
