import { AlertTriangle, ArrowRight, OctagonAlert } from 'lucide-react'
import type { HomeSummary } from '../home'
import { BudgetBar } from './BudgetBar'
import { formatBRL } from '../../shared/utils/money'
import { css, cx } from '../../../styled-system/css'

/** Início: this month's budgets — only when at least one budget exists */
export function BudgetHomeCard({ budgets, onOpen }: { budgets: HomeSummary['budgets']; onOpen: () => void }) {
  if (!budgets.has) return null
  const over = budgets.remaining < 0

  return (
    <section className={css({ mx: '5', md: { mx: '0', px: '6' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '5', pt: '5', pb: '4' })}>
      <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3' })}>
        <div>
          <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Orçamentos do mês</div>
          <div className={cx(css({ mt: '1', fontSize: '20', fontWeight: 'bold', lineHeight: 'tight' }, over ? { color: 'expense' } : { color: 'ink' }), 'nums')}>
            {over ? '−' : ''}{formatBRL(Math.abs(budgets.remaining))}
          </div>
          <div className={cx(css({ fontSize: '12', color: 'muted', mt: '0.5' }), 'nums')}>{over ? 'acima' : 'restam'} de {formatBRL(budgets.budgeted)} orçados</div>
        </div>
        <span className={css({ fontSize: '12', color: 'muted', whiteSpace: 'nowrap', pt: '0.5' })}>
          {budgets.alertCount === 0 ? 'Tudo dentro' : `${budgets.alertCount} ${budgets.alertCount === 1 ? 'alerta' : 'alertas'}`}
        </span>
      </div>

      {budgets.top.length > 0 && (
        <ul className={css({ mt: '3', '& > :not(:last-child)': { mb: '3' }, listStyle: 'none', p: '0', m: '0' })}>
          {budgets.top.map(l => {
            const isOver = l.status === 'over'
            const Icon = isOver ? OctagonAlert : AlertTriangle
            return (
              <li key={l.categoryId}>
                <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3', fontSize: '13' })}>
                  <span className={css({ fontWeight: 'medium', color: 'ink', truncate: true })}><span aria-hidden>{l.icon} </span>{l.name}</span>
                  <span className={css({ flexShrink: '0', fontSize: '12', display: 'inline-flex', alignItems: 'center', gap: '1', color: 'expense', fontWeight: 'semibold' })}>
                    <Icon size={13} strokeWidth={2.2} aria-hidden />
                    {isOver ? `Estourou ${formatBRL(l.spent - l.limit)}` : `${Math.round((l.spent / l.limit) * 100)}% usado`}
                  </span>
                </div>
                <div className={css({ mt: '1.5' })}><BudgetBar spent={l.spent} limit={l.limit} status={l.status} thin /></div>
              </li>
            )
          })}
        </ul>
      )}

      <div className={css({ mt: '3', pt: '3', borderTopWidth: '1px', borderColor: 'border', display: 'flex', justifyContent: 'flex-end' })}>
        <button onClick={onOpen} className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', fontSize: '13', fontWeight: 'semibold', color: 'ink', _hover: { opacity: '0.7' }, transition: 'opacity' })}>
          Ver orçamentos <ArrowRight size={15} strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}
