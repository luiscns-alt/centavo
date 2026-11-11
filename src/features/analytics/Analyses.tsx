import { Comparison } from './Comparison'
import { BudgetsView } from '../budgets'
import { MobileHeader } from '../../shared/ui/MobileHeader'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import { AccountFilter, type AccountScope } from '../accounts'
import { ScreenHeader } from '../../shared/ui/ScreenHeader'
import { css } from '../../../styled-system/css'

/** Views inside the Análises tab */
export type AnalysisView = 'compare' | 'budgets'

const VIEWS: { id: AnalysisView; label: string }[] = [
  { id: 'compare', label: 'Comparativo' },
  { id: 'budgets', label: 'Orçamentos' },
]

interface Props {
  view: AnalysisView
  onView: (v: AnalysisView) => void
  nav: MonthNav
  account: AccountScope
  onAdd: () => void
  onOpenCard: (id: number) => void
}

/** Análises tab: Comparativo (per account filter) and Orçamentos (always global) */
export function Analyses({ view, onView, nav, account, onAdd, onOpenCard }: Props) {
  return (
    <div className={css({ flex: '1', overflowY: 'auto', pb: '28', md: { pb: '12' } })}>
      <MobileHeader title="Análises" />
      <div className={css({ md: { maxW: '[760px]', mx: 'auto', px: '10', pt: '8' } })}>
        <ScreenHeader title="Análises" nav={nav} filter={view === 'compare' ? <AccountFilter value={account.selection} onChange={account.setSelection} /> : undefined} />

        <div className={css({ px: '5', md: { px: '0', mt: '-2' }, mt: '1', mb: '4' })}>
          <div className={css({ display: 'flex', bg: 'border/70', rounded: 'full', p: '0.5', w: 'full', md: { w: 'auto', display: 'inline-flex' } })} role="tablist" aria-label="Análise">
            {VIEWS.map(v => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                onClick={() => onView(v.id)}
                className={css({ flex: '1', md: { flex: 'none' }, h: '9', px: '5', rounded: 'full', fontSize: '13', fontWeight: 'semibold', transition: 'colors' }, view === v.id ? { bg: 'surface', color: 'ink', shadow: 'sm' } : { color: 'muted', _hover: { color: 'ink' } })}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'compare'
          ? <Comparison nav={nav} account={account} onAdd={onAdd} onOpenCard={onOpenCard} />
          : <BudgetsView nav={nav} accountFiltered={account.ids !== null} />}
      </div>
    </div>
  )
}
