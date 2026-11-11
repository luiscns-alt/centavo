import { AlertTriangle, ArrowRight, OctagonAlert } from 'lucide-react'
import type { HomeSummary } from '../home'
import { BudgetBar } from './BudgetBar'
import { formatBRL } from '../../shared/utils/money'

/** Início: this month's budgets — only when at least one budget exists */
export function BudgetHomeCard({ budgets, onOpen }: { budgets: HomeSummary['budgets']; onOpen: () => void }) {
  if (!budgets.has) return null
  const over = budgets.remaining < 0

  return (
    <section className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl px-5 md:px-6 pt-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Orçamentos do mês</div>
          <div className={`mt-1 text-[20px] font-bold nums leading-tight ${over ? 'text-expense' : 'text-ink'}`}>
            {over ? '−' : ''}{formatBRL(Math.abs(budgets.remaining))}
          </div>
          <div className="text-[12px] text-muted mt-0.5 nums">{over ? 'acima' : 'restam'} de {formatBRL(budgets.budgeted)} orçados</div>
        </div>
        <span className="text-[12px] text-muted whitespace-nowrap pt-0.5">
          {budgets.alertCount === 0 ? 'Tudo dentro' : `${budgets.alertCount} ${budgets.alertCount === 1 ? 'alerta' : 'alertas'}`}
        </span>
      </div>

      {budgets.top.length > 0 && (
        <ul className="mt-3 space-y-3 list-none p-0 m-0">
          {budgets.top.map(l => {
            const isOver = l.status === 'over'
            const Icon = isOver ? OctagonAlert : AlertTriangle
            return (
              <li key={l.categoryId}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-medium text-ink truncate"><span aria-hidden>{l.icon} </span>{l.name}</span>
                  <span className="shrink-0 text-[12px] inline-flex items-center gap-1 text-expense font-semibold">
                    <Icon size={13} strokeWidth={2.2} aria-hidden />
                    {isOver ? `Estourou ${formatBRL(l.spent - l.limit)}` : `${Math.round((l.spent / l.limit) * 100)}% usado`}
                  </span>
                </div>
                <div className="mt-1.5"><BudgetBar spent={l.spent} limit={l.limit} status={l.status} thin /></div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-border flex justify-end">
        <button onClick={onOpen} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:opacity-70 transition-opacity">
          Ver orçamentos <ArrowRight size={15} strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}
