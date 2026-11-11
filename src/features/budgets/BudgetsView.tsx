import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronDown, Gauge, OctagonAlert, Plus, X } from 'lucide-react'
import { db, sortCategories } from '../../core/db'
import { LedgerError } from '../../core/ledger/base'
import { saveBudget } from './ledger'
import type { BudgetLine } from './budgets'
import { useBudgetDashboard } from './useBudgets'
import { BudgetBar } from './BudgetBar'
import { Choice, FieldLabel, MoneyInput } from '../../shared/ui/MoneyInput'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import type { Category } from '../../core/types'
import { formatBRL } from '../../shared/utils/money'
import { formatMonthName, formatMonthShort } from '../../shared/utils/dates'
import { css, cx } from '../../../styled-system/css'
import { nums, slideUp } from '../../shared/ui/atoms'


/** Status in words + icon — the bar color is never the only signal */
export function BudgetStatusText({ line, compact = false }: { line: BudgetLine; compact?: boolean }) {
  if (line.limit === null) return <span className={css({ color: 'muted' })}>Sem limite</span>
  const pct = line.limit > 0 ? Math.round((line.spent / line.limit) * 100) : 0
  if (line.status === 'over') {
    return (
      <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', color: 'expense', fontWeight: 'semibold' })}>
        <OctagonAlert size={13} strokeWidth={2.2} aria-hidden />
        Estourou {formatBRL(-(line.remaining ?? 0))}
      </span>
    )
  }
  if (line.status === 'warning') {
    return (
      <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', color: 'expense', fontWeight: 'semibold' })}>
        <AlertTriangle size={13} strokeWidth={2.2} aria-hidden />
        {pct}% usado{compact ? '' : ` · resta ${formatBRL(line.remaining ?? 0)}`}
      </span>
    )
  }
  if (line.pace?.ahead && !compact) {
    return (
      <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', color: 'ink' })}>
        <Gauge size={13} strokeWidth={2} aria-hidden />
        Acima do ritmo · resta {formatBRL(line.remaining ?? 0)}
      </span>
    )
  }
  return <span className={css({ color: 'muted' })}>Resta {formatBRL(line.remaining ?? 0)}</span>
}

export function BudgetsView({ nav, accountFiltered }: { nav: MonthNav; accountFiltered: boolean }) {
  const dash = useBudgetDashboard(nav.year, nav.month)
  const [open, setOpen] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)

  if (!dash) return <div className={css({ h: '40' })} />
  const month = dash.month
  const withLimit = dash.lines.filter(l => l.limit !== null || l.children.some(k => k.limit !== null))
  const without = dash.lines.filter(l => !withLimit.includes(l))

  // Categories whose row already hosts the editor
  const rendered = new Set<number>([
    ...withLimit.flatMap(l => [l, ...l.children]).map(l => l.category.id as number),
    ...without.map(l => l.category.id as number),
  ])
  const startEdit = (id: number) => { setEditing(id); setOpen(id); setPicking(false) }

  return (
    <div className={slideUp}>
      {accountFiltered && (
        <p className={css({ mx: '5', md: { mx: '0' }, mt: '3', fontSize: '12', color: 'muted' })}>Orçamentos somam todas as contas e cartões, sem o filtro de conta.</p>
      )}

      {!dash.hasBudgets ? (
        <section className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '5', py: '8', textAlign: 'center' })}>
          <div className={css({ fontSize: '15', fontWeight: 'semibold', color: 'ink' })}>Nenhum orçamento ainda</div>
          <p className={css({ fontSize: '13', color: 'muted', mt: '1', maxW: '[340px]', mx: 'auto', lineHeight: 'relaxed' })}>
            Defina um limite mensal por categoria. Compras no cartão contam no mês da fatura, e estornos devolvem ao orçamento.
          </p>
          <button
            onClick={() => setPicking(true)}
            className={css({ mt: '5', display: 'inline-flex', alignItems: 'center', gap: '1.5', h: '9', px: '4', rounded: 'full', bg: 'ink', color: 'bg', fontSize: '13', fontWeight: 'semibold' })}
          >
            <Plus size={15} strokeWidth={2} /> Criar orçamento
          </button>
        </section>
      ) : (
        <Summary dash={dash} month={month} />
      )}

      {picking && (
        <Picker
          exclude={new Set(dash.lines.flatMap(l => [l, ...l.children]).filter(l => l.limit !== null).map(l => l.category.id as number))}
          onPick={id => startEdit(id)}
          onClose={() => setPicking(false)}
        />
      )}
      {editing !== null && !rendered.has(editing) && (
        <NewLineEditor categoryId={editing} month={month} onDone={() => setEditing(null)} />
      )}

      {withLimit.length > 0 && (
        <section className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' } })}>
          {withLimit.map(l => (
            <Row
              key={l.category.id}
              line={l}
              month={month}
              open={open === l.category.id}
              onToggle={() => setOpen(o => (o === l.category.id ? null : l.category.id as number))}
              editing={editing}
              onEdit={startEdit}
              onDoneEdit={() => setEditing(null)}
            />
          ))}
          <div className={css({ px: '4', md: { px: '5' }, py: '3' })}>
            <button
              onClick={() => setPicking(p => !p)}
              className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', fontSize: '13', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' } })}
            >
              <Plus size={15} strokeWidth={2} /> Orçamento
            </button>
          </div>
        </section>
      )}

      {without.length > 0 && (
        <section className={css({ mx: '5', md: { mx: '0' }, mt: '6' })}>
          <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', px: '1', mb: '2' })}>
            <h2 className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', m: '0' })}>Sem orçamento</h2>
            <span className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>{formatBRL(without.reduce((s, l) => s + l.spent, 0))}</span>
          </div>
          <div className={css({ bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' } })}>
            {without.map(l => (
              <div key={l.category.id}>
                <div className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '4', md: { px: '5' }, py: '3' })}>
                  <span className={css({ fontSize: '16', w: '6', textAlign: 'center' })} aria-hidden>{l.category.icon}</span>
                  <span className={css({ flex: '1', minW: '0', fontSize: '14', fontWeight: 'medium', color: 'ink', truncate: true })}>{l.category.name}</span>
                  <span className={cx(css({ fontSize: '14', fontWeight: 'semibold', color: 'ink' }), nums)}>{formatBRL(l.spent)}</span>
                  <button
                    onClick={() => startEdit(l.category.id as number)}
                    className={css({ fontSize: '12', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' }, borderWidth: '1px', borderColor: 'border', rounded: 'full', h: '7', px: '2.5' })}
                  >
                    Definir limite
                  </button>
                </div>
                {editing === l.category.id && (
                  <div className={css({ px: '4', md: { px: '5' }, pb: '4' })}>
                    <Editor line={l} month={month} onDone={() => setEditing(null)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Summary({ dash, month }: { dash: NonNullable<ReturnType<typeof useBudgetDashboard>>; month: string }) {
  const t = dash.totals
  const status = t.budgetedSpent > t.budgeted ? 'over' : t.budgetedSpent >= t.budgeted * 0.8 ? 'warning' : 'ok'
  return (
    <section className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '5', py: '4' })}>
      <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>
        {t.remaining >= 0 ? `Resta em ${formatMonthName(month)}` : `Acima do orçado em ${formatMonthName(month)}`}
      </div>
      <div className={cx(css({ fontFamily: 'serif', fontSize: '40', lineHeight: 'none', mt: '1' }, t.remaining < 0 ? { color: 'expense' } : { color: 'ink' }), nums)}>
        {t.remaining < 0 ? '−' : ''}{formatBRL(Math.abs(t.remaining))}
      </div>
      <div className={css({ mt: '3' })}>
        <BudgetBar spent={t.budgetedSpent} limit={t.budgeted} status={status} />
      </div>
      <div className={cx(css({ mt: '2', display: 'flex', flexWrap: 'wrap', columnGap: '4', rowGap: '1', fontSize: '12', color: 'muted' }), nums)}>
        <span><span className={css({ color: 'ink', fontWeight: 'semibold' })}>{formatBRL(t.budgetedSpent)}</span> de {formatBRL(t.budgeted)} orçados</span>
        {t.unbudgetedSpent !== 0 && <span>{formatBRL(t.unbudgetedSpent)} fora do orçamento</span>}
        {t.projected > 0 && <span>+ {formatBRL(t.projected)} em parcelas a vencer</span>}
      </div>
    </section>
  )
}

function Row({ line, month, open, onToggle, editing, onEdit, onDoneEdit, child = false }: {
  line: BudgetLine
  month: string
  open: boolean
  onToggle: () => void
  editing: number | null
  onEdit: (id: number) => void
  onDoneEdit: () => void
  child?: boolean
}) {
  const id = line.category.id as number
  const [openChild, setOpenChild] = useState<number | null>(null)
  const b = line.breakdown
  const parts = [
    { label: 'À vista / débito / Pix', value: b.oneOff },
    { label: 'Parcelas de cartão', value: b.cardInstallments },
    { label: 'Empréstimos', value: b.loan },
  ].filter(p => p.value > 0)

  return (
    <div className={css(child ? { pl: '3', md: { pl: '6' } } : {})}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={css({ w: 'full', textAlign: 'left', px: '4', md: { px: '5' }, py: '3.5', _hover: { bg: 'bg/50' }, transition: 'colors' })}
      >
        <div className={css({ display: 'flex', alignItems: 'flex-start', gap: '3' })}>
          <span className={css({ fontSize: '16', lineHeight: '[1.25rem]', w: '6', textAlign: 'center', flexShrink: '0' })} aria-hidden>{line.category.icon}</span>
          <div className={css({ flex: '1', minW: '0' })}>
            <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
              <span className={css({ fontSize: '14', fontWeight: 'semibold', color: 'ink', truncate: true })}>
                {line.category.name}
                {line.isOverride && <span className={css({ ml: '1.5', fontSize: '11', fontWeight: 'medium', color: 'muted' })}>só este mês</span>}
              </span>
              <span className={cx(css({ fontSize: '14', flexShrink: '0' }), nums)}>
                <span className={css({ fontWeight: 'bold', color: 'ink' })}>{formatBRL(line.spent)}</span>
                {line.limit !== null && <span className={css({ color: 'muted' })}> / {formatBRL(line.limit)}</span>}
              </span>
            </div>
            {line.limit !== null && (
              <div className={css({ mt: '2' })}>
                <BudgetBar spent={line.spent} limit={line.limit} status={line.status} pace={line.pace?.expected} thin={child} />
              </div>
            )}
            <div className={css({ mt: '1.5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2', fontSize: '12' })}>
              <BudgetStatusText line={line} />
              <ChevronDown size={15} className={css({ color: 'muted', transition: 'transform' }, open ? { rotate: '[180deg]' } : {})} aria-hidden />
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className={cx(css({ px: '4', md: { px: '5', pl: '14' }, pb: '4', pl: '[3.25rem]', fontSize: '13' }), slideUp)}>
          {(parts.length > 0 || b.refunds > 0) && (
            <dl className={cx(css({ '& > :not(:last-child)': { mb: '1' } }), nums)}>
              {parts.map(p => (
                <div key={p.label} className={css({ display: 'flex', justifyContent: 'space-between', gap: '3' })}>
                  <dt className={css({ color: 'muted' })}>{p.label}</dt><dd className={css({ color: 'ink' })}>{formatBRL(p.value)}</dd>
                </div>
              ))}
              {b.refunds > 0 && (
                <div className={css({ display: 'flex', justifyContent: 'space-between', gap: '3' })}>
                  <dt className={css({ color: 'muted' })}>Estornos</dt><dd className={css({ color: 'ink' })}>−{formatBRL(b.refunds)}</dd>
                </div>
              )}
            </dl>
          )}
          {line.projected > 0 && (
            <p className={css({ mt: '2', color: 'muted' })}>
              + {formatBRL(line.projected)} em parcelas de empréstimo a vencer este mês
              {line.projectedStatus === 'over' && line.status !== 'over' && <span className={css({ color: 'expense', fontWeight: 'semibold' })}> — vai estourar</span>}
            </p>
          )}
          {line.committedAhead.length > 0 && (
            <p className={css({ mt: '2', color: 'muted' })}>
              Já comprometido no cartão: {line.committedAhead.map(a => `${formatBRL(a.amount)} em ${formatMonthShort(a.month)}`).join(' · ')}
            </p>
          )}
          {line.pace && line.limit !== null && (
            <p className={css({ mt: '2', color: 'muted' })}>Ritmo do mês: até hoje, o esperado seria {formatBRL(line.pace.expected)}.</p>
          )}

          {editing === id
            ? <div className={css({ mt: '3' })}><Editor line={line} month={month} onDone={onDoneEdit} /></div>
            : (
              <button
                onClick={() => onEdit(id)}
                className={css({ mt: '3', fontSize: '12', fontWeight: 'semibold', color: 'ink', borderWidth: '1px', borderColor: 'border', rounded: 'full', h: '8', px: '3', _hover: { bg: 'bg' } })}
              >
                {line.limit === null ? 'Definir limite' : 'Alterar limite'}
              </button>
            )}
        </div>
      )}

      {line.children.length > 0 && (
        <div className={css({ borderTopWidth: '1px', borderColor: 'border/60' })}>
          {line.children.map(k => (
            <Row
              key={k.category.id}
              line={k}
              month={month}
              child
              open={openChild === k.category.id}
              onToggle={() => setOpenChild(o => (o === k.category.id ? null : k.category.id as number))}
              editing={editing}
              onEdit={id => { setOpenChild(id); onEdit(id) }}
              onDoneEdit={onDoneEdit}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Editor({ line, month, onDone }: { line: Pick<BudgetLine, 'category' | 'limit' | 'isOverride'>; month: string; onDone: () => void }) {
  const [amount, setAmount] = useState<number | null>(line.limit)
  const [scope, setScope] = useState<'from' | 'once'>(line.isOverride ? 'once' : 'from')
  const [error, setError] = useState('')
  const id = line.category.id as number

  async function run(value: number | null) {
    setError('')
    try {
      await saveBudget({ categoryId: id, month, amount: value, scope })
      onDone()
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível salvar.')
    }
  }

  const removeLabel = scope === 'once' ? 'Remover exceção' : 'Encerrar orçamento'
  const canRemove = scope === 'once' ? line.isOverride : line.limit !== null && !line.isOverride

  return (
    <div className={css({ rounded: 'xl', borderWidth: '1px', borderColor: 'border', bg: 'bg/60', p: '3' })}>
      <FieldLabel>Limite de {line.category.name}</FieldLabel>
      <MoneyInput value={amount} onChange={setAmount} label={`Limite mensal de ${line.category.name}`} onSurface />
      <div className={css({ mt: '3' })}>
        <Choice
          label="Vale para"
          value={scope}
          onChange={setScope}
          options={[{ id: 'from', label: `A partir de ${formatMonthName(month)}` }, { id: 'once', label: `Só em ${formatMonthName(month)}` }]}
        />
      </div>
      {error && <p className={css({ mt: '2', fontSize: '12', color: 'expense' })} role="alert">{error}</p>}
      <div className={css({ mt: '3', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' })}>
        <button
          onClick={() => run(amount)}
          disabled={!amount}
          className={css({ h: '9', px: '4', rounded: 'full', bg: 'ink', color: 'bg', fontSize: '13', fontWeight: 'semibold', _disabled: { opacity: '0.4' } })}
        >
          Salvar
        </button>
        <button onClick={onDone} className={css({ h: '9', px: '3', rounded: 'full', fontSize: '13', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' } })}>Cancelar</button>
        {canRemove && (
          <button onClick={() => run(null)} className={css({ ml: 'auto', h: '9', px: '3', rounded: 'full', fontSize: '13', fontWeight: 'semibold', color: 'expense', _hover: { bg: 'expense.light' } })}>
            {removeLabel}
          </button>
        )}
      </div>
    </div>
  )
}

/** Editor for a category that has no line this month (no spending, no limit yet) */
function NewLineEditor({ categoryId, month, onDone }: { categoryId: number; month: string; onDone: () => void }) {
  const category = useLiveQuery(() => db.categories.get(categoryId), [categoryId])
  if (!category) return null
  return (
    <section className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', p: '4' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', mb: '3', fontSize: '14', fontWeight: 'semibold', color: 'ink' })}>
        <span aria-hidden>{category.icon}</span>{category.name}
      </div>
      <Editor line={{ category, limit: null, isOverride: false }} month={month} onDone={onDone} />
    </section>
  )
}

function Picker({ exclude, onPick, onClose }: { exclude: Set<number>; onPick: (id: number) => void; onClose: () => void }) {
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray())
  const list = useMemo(() => sortCategories(categories ?? []).filter(c => !exclude.has(c.id as number)), [categories, exclude])
  return (
    <section className={cx(css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', p: '4' }), slideUp)}>
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '3' })}>
        <h3 className={css({ m: '0', fontSize: '14', fontWeight: 'semibold', color: 'ink' })}>Orçamento para qual categoria?</h3>
        <button onClick={onClose} aria-label="Fechar" className={css({ w: '8', h: '8', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink' } })}>
          <X size={16} />
        </button>
      </div>
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' })}>
        {list.map((c: Category) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id as number)}
            className={css({ h: '8', px: '3', rounded: 'full', borderWidth: '1px', borderColor: 'border', fontSize: '12', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' }, display: 'inline-flex', alignItems: 'center', gap: '1.5' })}
          >
            <span aria-hidden>{c.icon}</span>
            {c.parentId != null && <span className={css({ color: 'muted' })}>↳</span>}
            {c.name}
          </button>
        ))}
      </div>
    </section>
  )
}
