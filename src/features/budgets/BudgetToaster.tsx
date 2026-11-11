import { useEffect, useRef, useState } from 'react'
import { OctagonAlert, AlertTriangle, X } from 'lucide-react'
import { crossed, type BudgetDashboard, type BudgetStatus } from './budgets'
import { liveQuery } from 'dexie'
import { loadBudgetDashboard } from './useBudgets'
import { MONTH_LONG } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'
import { STORAGE_KEYS } from '../../shared/constants/storageKeys'
import { readJSON, writeJSON } from '../../shared/utils/storage'

interface Toast { id: string; level: 'warning' | 'over'; text: string }

function readSeen(): Record<string, 'warning' | 'over'> {
  return readJSON<Record<string, 'warning' | 'over'>>(STORAGE_KEYS.budgetAlerts, {})
}
function writeSeen(v: Record<string, 'warning' | 'over'>) {
  writeJSON(STORAGE_KEYS.budgetAlerts, v)
}

function statuses(d: BudgetDashboard): Map<number, { status: BudgetStatus; name: string; over: number }> {
  const m = new Map<number, { status: BudgetStatus; name: string; over: number }>()
  for (const l of d.lines.flatMap(l => [l, ...l.children])) {
    m.set(l.category.id as number, { status: l.status, name: l.category.name, over: -(l.remaining ?? 0) })
  }
  return m
}

function detect(dashboards: BudgetDashboard[], prev: Map<string, BudgetStatus>): Toast | null {
  const found: Toast[] = []
  const seen = readSeen()
  for (const d of dashboards) {
    const isBaseline = !prev.has(`${d.month}:*`)
    prev.set(`${d.month}:*`, 'none')
    for (const [catId, s] of statuses(d)) {
      const key = `${d.month}:${catId}`
      const before = prev.get(key) ?? 'none'
      prev.set(key, s.status)
      if (isBaseline) continue
      const level = crossed(before, s.status)
      if (!level || seen[key] === 'over' || seen[key] === level) continue
      seen[key] = level
      const mon = MONTH_LONG[Number(d.month.slice(5)) - 1]
      found.push({
        id: `${key}:${level}`,
        level,
        text: level === 'over'
          ? `${s.name} estourou o orçamento de ${mon} em ${formatBRL(s.over)}.`
          : `${s.name} passou de 80% do orçamento de ${mon}.`,
      })
    }
  }
  if (!found.length) return null
  writeSeen(seen)
  return found.find(t => t.level === 'over') ?? found[0]
}

/**
 * One-time notice when a change pushes a budget past 80% or 100%. Watches this month and the next
 * (card purchases usually land on next month's invoice). Each category-month-level is announced
 * once (remembered in localStorage); the first read is only a baseline, never a toast.
 */
export function BudgetToaster({ onOpen }: { onOpen: () => void }) {
  const prev = useRef(new Map<string, BudgetStatus>())
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth() + 1
    const sub = liveQuery(() => Promise.all([
      loadBudgetDashboard(y, m),
      loadBudgetDashboard(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1),
    ])).subscribe({
      next: dashboards => {
        const found = detect(dashboards, prev.current)
        if (found) setToast(found)
      },
      error: () => { /* a failed read just means no toast */ },
    })
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null
  const Icon = toast.level === 'over' ? OctagonAlert : AlertTriangle
  return (
    <div className="fixed inset-x-0 bottom-24 md:bottom-6 z-50 flex justify-center px-4 pointer-events-none">
      <div role="status" className="toast-in pointer-events-auto max-w-[440px] w-full bg-ink text-bg rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
        <Icon size={18} strokeWidth={2} className="shrink-0" aria-hidden />
        <p className="flex-1 m-0 text-[13px] leading-snug">{toast.text}</p>
        <button onClick={() => { setToast(null); onOpen() }} className="text-[13px] font-semibold underline underline-offset-2 shrink-0">Ver</button>
        <button onClick={() => setToast(null)} aria-label="Fechar aviso" className="opacity-70 hover:opacity-100 shrink-0"><X size={16} /></button>
      </div>
    </div>
  )
}
