import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronDown, Gauge, OctagonAlert, Plus, X } from 'lucide-react'
import { db, formatBRL, sortCategories, type Category } from '../../core/db'
import { LedgerError } from '../../core/ledger/base'
import { saveBudget } from './ledger'
import type { BudgetLine } from './budgets'
import { useBudgetDashboard } from './useBudgets'
import { MONTH_LONG, MONTH_SHORT } from '../../shared/charts/chartUtils'
import { BudgetBar } from './BudgetBar'
import { Choice, FieldLabel, MoneyInput } from '../../shared/ui/MoneyInput'
import type { MonthNav } from '../../shared/ui/MonthSelector'

const monthName = (key: string) => MONTH_LONG[Number(key.slice(5)) - 1]
const shortMonth = (key: string) => `${MONTH_SHORT[Number(key.slice(5)) - 1]}/${key.slice(2, 4)}`

/** Status in words + icon — the bar color is never the only signal */
export function BudgetStatusText({ line, compact = false }: { line: BudgetLine; compact?: boolean }) {
  if (line.limit === null) return <span className="text-muted">Sem limite</span>
  const pct = line.limit > 0 ? Math.round((line.spent / line.limit) * 100) : 0
  if (line.status === 'over') {
    return (
      <span className="inline-flex items-center gap-1 text-expense font-semibold">
        <OctagonAlert size={13} strokeWidth={2.2} aria-hidden />
        Estourou {formatBRL(-(line.remaining ?? 0))}
      </span>
    )
  }
  if (line.status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 text-expense font-semibold">
        <AlertTriangle size={13} strokeWidth={2.2} aria-hidden />
        {pct}% usado{compact ? '' : ` · resta ${formatBRL(line.remaining ?? 0)}`}
      </span>
    )
  }
  if (line.pace?.ahead && !compact) {
    return (
      <span className="inline-flex items-center gap-1 text-ink">
        <Gauge size={13} strokeWidth={2} aria-hidden />
        Acima do ritmo · resta {formatBRL(line.remaining ?? 0)}
      </span>
    )
  }
  return <span className="text-muted">Resta {formatBRL(line.remaining ?? 0)}</span>
}

export function BudgetsView({ nav, accountFiltered }: { nav: MonthNav; accountFiltered: boolean }) {
  const dash = useBudgetDashboard(nav.year, nav.month)
  const [open, setOpen] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)

  if (!dash) return <div className="h-40" />
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
    <div className="slide-up">
      {accountFiltered && (
        <p className="mx-5 md:mx-0 mt-3 text-[12px] text-muted">Orçamentos somam todas as contas e cartões, sem o filtro de conta.</p>
      )}

      {!dash.hasBudgets ? (
        <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl px-5 py-8 text-center">
          <div className="text-[15px] font-semibold text-ink">Nenhum orçamento ainda</div>
          <p className="text-[13px] text-muted mt-1 max-w-[340px] mx-auto leading-relaxed">
            Defina um limite mensal por categoria. Compras no cartão contam no mês da fatura, e estornos devolvem ao orçamento.
          </p>
          <button
            onClick={() => setPicking(true)}
            className="mt-5 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-ink text-bg text-[13px] font-semibold"
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
        <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl divide-y divide-border">
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
          <div className="px-4 md:px-5 py-3">
            <button
              onClick={() => setPicking(p => !p)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"
            >
              <Plus size={15} strokeWidth={2} /> Orçamento
            </button>
          </div>
        </section>
      )}

      {without.length > 0 && (
        <section className="mx-5 md:mx-0 mt-6">
          <div className="flex items-baseline justify-between px-1 mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted m-0">Sem orçamento</h2>
            <span className="text-[12px] text-muted nums">{formatBRL(without.reduce((s, l) => s + l.spent, 0))}</span>
          </div>
          <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
            {without.map(l => (
              <div key={l.category.id}>
                <div className="flex items-center gap-3 px-4 md:px-5 py-3">
                  <span className="text-[16px] w-6 text-center" aria-hidden>{l.category.icon}</span>
                  <span className="flex-1 min-w-0 text-[14px] font-medium text-ink truncate">{l.category.name}</span>
                  <span className="text-[14px] font-semibold nums text-ink">{formatBRL(l.spent)}</span>
                  <button
                    onClick={() => startEdit(l.category.id as number)}
                    className="text-[12px] font-semibold text-muted hover:text-ink border border-border rounded-full h-7 px-2.5"
                  >
                    Definir limite
                  </button>
                </div>
                {editing === l.category.id && (
                  <div className="px-4 md:px-5 pb-4">
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
    <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">
        {t.remaining >= 0 ? `Resta em ${monthName(month)}` : `Acima do orçado em ${monthName(month)}`}
      </div>
      <div className={`font-serif text-[40px] leading-none mt-1 nums ${t.remaining < 0 ? 'text-expense' : 'text-ink'}`}>
        {t.remaining < 0 ? '−' : ''}{formatBRL(Math.abs(t.remaining))}
      </div>
      <div className="mt-3">
        <BudgetBar spent={t.budgetedSpent} limit={t.budgeted} status={status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted nums">
        <span><span className="text-ink font-semibold">{formatBRL(t.budgetedSpent)}</span> de {formatBRL(t.budgeted)} orçados</span>
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
    <div className={child ? 'pl-3 md:pl-6' : ''}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-4 md:px-5 py-3.5 hover:bg-bg/50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <span className="text-[16px] leading-5 w-6 text-center shrink-0" aria-hidden>{line.category.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-ink truncate">
                {line.category.name}
                {line.isOverride && <span className="ml-1.5 text-[11px] font-medium text-muted">só este mês</span>}
              </span>
              <span className="text-[14px] nums shrink-0">
                <span className="font-bold text-ink">{formatBRL(line.spent)}</span>
                {line.limit !== null && <span className="text-muted"> / {formatBRL(line.limit)}</span>}
              </span>
            </div>
            {line.limit !== null && (
              <div className="mt-2">
                <BudgetBar spent={line.spent} limit={line.limit} status={line.status} pace={line.pace?.expected} thin={child} />
              </div>
            )}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
              <BudgetStatusText line={line} />
              <ChevronDown size={15} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 md:px-5 pb-4 pl-13 md:pl-14 text-[13px] slide-up">
          {(parts.length > 0 || b.refunds > 0) && (
            <dl className="space-y-1 nums">
              {parts.map(p => (
                <div key={p.label} className="flex justify-between gap-3">
                  <dt className="text-muted">{p.label}</dt><dd className="text-ink">{formatBRL(p.value)}</dd>
                </div>
              ))}
              {b.refunds > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Estornos</dt><dd className="text-ink">−{formatBRL(b.refunds)}</dd>
                </div>
              )}
            </dl>
          )}
          {line.projected > 0 && (
            <p className="mt-2 text-muted">
              + {formatBRL(line.projected)} em parcelas de empréstimo a vencer este mês
              {line.projectedStatus === 'over' && line.status !== 'over' && <span className="text-expense font-semibold"> — vai estourar</span>}
            </p>
          )}
          {line.committedAhead.length > 0 && (
            <p className="mt-2 text-muted">
              Já comprometido no cartão: {line.committedAhead.map(a => `${formatBRL(a.amount)} em ${shortMonth(a.month)}`).join(' · ')}
            </p>
          )}
          {line.pace && line.limit !== null && (
            <p className="mt-2 text-muted">Ritmo do mês: até hoje, o esperado seria {formatBRL(line.pace.expected)}.</p>
          )}

          {editing === id
            ? <div className="mt-3"><Editor line={line} month={month} onDone={onDoneEdit} /></div>
            : (
              <button
                onClick={() => onEdit(id)}
                className="mt-3 text-[12px] font-semibold text-ink border border-border rounded-full h-8 px-3 hover:bg-bg"
              >
                {line.limit === null ? 'Definir limite' : 'Alterar limite'}
              </button>
            )}
        </div>
      )}

      {line.children.length > 0 && (
        <div className="border-t border-border/60">
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
    <div className="rounded-xl border border-border bg-bg/60 p-3">
      <FieldLabel>Limite de {line.category.name}</FieldLabel>
      <MoneyInput value={amount} onChange={setAmount} label={`Limite mensal de ${line.category.name}`} className="bg-surface" />
      <div className="mt-3">
        <Choice
          label="Vale para"
          value={scope}
          onChange={setScope}
          options={[{ id: 'from', label: `A partir de ${monthName(month)}` }, { id: 'once', label: `Só em ${monthName(month)}` }]}
        />
      </div>
      {error && <p className="mt-2 text-[12px] text-expense" role="alert">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => run(amount)}
          disabled={!amount}
          className="h-9 px-4 rounded-full bg-ink text-bg text-[13px] font-semibold disabled:opacity-40"
        >
          Salvar
        </button>
        <button onClick={onDone} className="h-9 px-3 rounded-full text-[13px] font-semibold text-muted hover:text-ink">Cancelar</button>
        {canRemove && (
          <button onClick={() => run(null)} className="ml-auto h-9 px-3 rounded-full text-[13px] font-semibold text-expense hover:bg-expense-light">
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
    <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3 text-[14px] font-semibold text-ink">
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
    <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl p-4 slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-[14px] font-semibold text-ink">Orçamento para qual categoria?</h3>
        <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c: Category) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id as number)}
            className="h-8 px-3 rounded-full border border-border text-[12px] font-semibold text-ink hover:bg-bg inline-flex items-center gap-1.5"
          >
            <span aria-hidden>{c.icon}</span>
            {c.parentId != null && <span className="text-muted">↳</span>}
            {c.name}
          </button>
        ))}
      </div>
    </section>
  )
}
