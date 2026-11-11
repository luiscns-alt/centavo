import { useMonthlyData, type CategorySummary, EvolutionCard } from '../analytics'
import { MonthSelector, type MonthNav } from '../../shared/ui/MonthSelector'
import { CategoryRow } from '../categories'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionLabel } from '../../shared/ui/SectionLabel'
import { PAYMENT_METHODS } from '../../core/constants/domain'
import type { PaymentMethod } from '../../core/types'
import { formatBRL, formatDelta, toneClass } from '../../shared/utils/money'
import { MONTH_LONG } from '../../shared/utils/dates'
import { css, cx } from '../../../styled-system/css'
import { barGrow, nums } from '../../shared/ui/atoms'


interface Props {
  nav: MonthNav
  accountIds: number[] | null
  onAdd: () => void
  onOpenCompare: () => void
}

/**
 * Início, below the fold: the month picked in the selector — Saldo Livre (receitas − despesas),
 * patrimônio chart and the breakdowns. Loaded lazily (own chunk, mounted near the viewport).
 */
export default function MonthSection({ nav, accountIds, onAdd, onOpenCompare }: Props) {
  const { totalIncome, totalExpense, freeBalance, transfersIn, transfersOut, byCategory, byMethod, carry, loading } =
    useMonthlyData(nav.year, nav.month, accountIds)
  const expenses = byCategory.filter(c => c.type === 'expense')
  const incomes  = byCategory.filter(c => c.type === 'income')
  const isEmpty  = !loading && byCategory.length === 0

  return (
    <div className={css({ mt: '10' })}>
      <div className={css({ px: '5', md: { px: '0' }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', mb: '3' })}>
        <h2 className={css({ m: '0', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>O mês</h2>
        <MonthSelector {...nav} align="start" />
      </div>

      <div className={css({ lg: { display: 'grid', gridTemplateColumns: '380px 1fr', gap: '6', alignItems: 'flex-start' } })}>
        <div>
          <section className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', overflow: 'hidden' })}>
            {carry === null ? (
              <div className={css({ px: '5', md: { px: '8' }, pt: '6', pb: '5', textAlign: 'center' })}>
                <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '2' })}>Saldo livre</div>
                <div className={cx(css({ fontSize: '28', fontWeight: 'bold', lineHeight: 'none' }, loading ? { color: 'muted', opacity: '0.3' } : freeBalance > 0 ? { color: 'income' } : freeBalance < 0 ? { color: 'expense' } : { color: 'muted' }), nums)}>
                  {loading ? '–' : formatBRL(freeBalance)}
                </div>
              </div>
            ) : (
              <CarriedBalance month={nav.month} carry={carry} result={freeBalance} loading={loading} />
            )}
            <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', borderTopWidth: '1px', borderColor: 'border' })}>
              <Summary label="Receitas" tone="income" value={loading ? '–' : formatBRL(totalIncome)} />
              <Summary label="Despesas" tone="expense" value={loading ? '–' : formatBRL(totalExpense)} divider />
            </div>
            {!loading && (totalIncome > 0 || totalExpense > 0) && (
              <SpendRatio income={totalIncome} expense={totalExpense} />
            )}
            {!loading && accountIds !== null && (transfersIn > 0 || transfersOut > 0) && (
              <div className={css({ mx: '5', md: { mx: '8' }, mb: '4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12' })}>
                <span className={css({ color: 'muted' })}>⇄ Transferências no mês</span>
                <span className={cx(css({ color: 'ink', fontWeight: 'semibold' }), nums)}>
                  {transfersIn > 0 && `+${formatBRL(transfersIn)}`}
                  {transfersIn > 0 && transfersOut > 0 && ' · '}
                  {transfersOut > 0 && `−${formatBRL(transfersOut)}`}
                </span>
              </div>
            )}
          </section>
          <EvolutionCard nav={nav} accountIds={accountIds} onOpenCompare={onOpenCompare} />
        </div>

        <section className={css({ mt: '6', lg: { mt: '0' }, px: '5', md: { px: '6', py: '5', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' } })}>
          {isEmpty ? (
            <EmptyState
              title={`Nada em ${MONTH_LONG[nav.month - 1]} ainda`}
              description="Registre uma receita ou despesa e o resumo por categoria aparece aqui."
              actionLabel="Novo lançamento"
              onAction={onAdd}
            />
          ) : (
            <div className={css({ display: 'flex', flexDirection: 'column', gap: '6' })}>
              <CategoryGroup title="Despesas por categoria" items={expenses} total={totalExpense} />
              <MethodGroup items={byMethod} total={totalExpense} />
              <CategoryGroup title="Receitas por categoria" items={incomes} total={totalIncome} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * All accounts: the month as a running total — what was left from earlier months, plus this month's
 * result. Spending a previous surplus no longer looks like a loss (DESIGN.md › Início › O mês).
 */
function CarriedBalance({ month, carry, result, loading }: { month: number; carry: number; result: number; loading: boolean }) {
  const total = carry + result
  const prev = MONTH_LONG[(month + 10) % 12]
  return (
    <div className={css({ px: '5', md: { px: '8' }, pt: '6', pb: '5', textAlign: 'center' })}>
      <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '2' })}>Saldo de {MONTH_LONG[month - 1]}</div>
      <div className={cx(css({ fontSize: '28', fontWeight: 'bold', lineHeight: 'none' }), nums, loading ? css({ color: 'muted', opacity: '0.3' }) : toneClass(total))}>
        {loading ? '–' : formatBRL(total)}
      </div>
      {!loading && (
        <div className={cx(css({ mt: '3', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '3', rowGap: '1', fontSize: '12' }), nums)}>
          <span className={css({ color: 'muted' })}>{carry < 0 ? 'Déficit' : 'Sobra'} de {prev} <span className={cx(css({ fontWeight: 'semibold' }), toneClass(carry))}>{formatDelta(carry)}</span></span>
          <span className={css({ color: 'muted' })}>Resultado do mês <span className={cx(css({ fontWeight: 'semibold' }), toneClass(result))}>{formatDelta(result)}</span></span>
        </div>
      )}
    </div>
  )
}

function Summary({ label, tone, value, divider = false }: {
  label: string; tone: 'income' | 'expense'; value: string; divider?: boolean
}) {
  return (
    <div className={css({ px: '4', md: { px: '8', py: '5' }, py: '4' }, divider ? { borderLeftWidth: '1px', borderColor: 'border' } : {})}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '1.5', mb: '1' })}>
        <span className={css({ w: '1.5', h: '1.5', rounded: 'full' }, tone === 'income' ? { bg: 'income' } : { bg: 'expense' })} />
        <span className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]' }, tone === 'income' ? { color: 'income' } : { color: 'expense' })}>
          {label}
        </span>
      </div>
      <div className={cx(css({ fontSize: '17', fontWeight: 'bold', color: 'ink', truncate: true }), nums)}>{value}</div>
    </div>
  )
}

/** How much of the month's income the expenses consumed */
function SpendRatio({ income, expense }: { income: number; expense: number }) {
  const ratio = income > 0 ? expense / income : null
  const pct = ratio === null ? 100 : Math.round(ratio * 100)

  return (
    <div className={css({ px: '5', md: { px: '8' }, pt: '4', pb: '4' })}>
      <div className={css({ h: '1.5', rounded: 'full', bg: 'income.light', overflow: 'hidden' })}>
        <div
          className={cx(css({ h: 'full', rounded: 'full', bg: 'expense' }), barGrow)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className={css({ fontSize: '12', color: 'muted', mt: '2', m: '0' })}>
        {ratio === null
          ? 'Nenhuma receita registrada neste mês.'
          : pct > 999
            ? <>Você gastou <span className={cx(css({ fontWeight: 'semibold', color: 'ink' }), nums)}>mais de 10×</span> o que recebeu.</>
            : <>Você gastou <span className={cx(css({ fontWeight: 'semibold', color: 'ink' }), nums)}>{pct}%</span> do que recebeu.</>}
      </p>
    </div>
  )
}

function CategoryGroup({ title, items, total }: { title: string; items: CategorySummary[]; total: number }) {
  if (items.length === 0) return null
  return (
    <div>
      <SectionLabel right={formatBRL(total)}>{title}</SectionLabel>
      <div className={css({ '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' } })}>
        {items.map(({ category, total: t, type }, i) => (
          <CategoryRow
            key={category.id}
            index={i}
            icon={category.icon}
            name={category.name}
            type={type}
            amount={formatBRL(t)}
            share={total > 0 ? t / total : 0}
          />
        ))}
      </div>
    </div>
  )
}

const METHOD_ICON: Record<PaymentMethod | 'none', string> = {
  pix: '⚡', credit: '💳', debit: '🏧', boleto: '🧾', cash: '💵', ted: '🏦', none: '·',
}

/** Despesas por forma de pagamento — Pix × cartão × débito… */
function MethodGroup({ items, total }: { items: { method: PaymentMethod | 'none'; total: number }[]; total: number }) {
  if (items.length < 2 && items[0]?.method === 'none') return null
  if (items.length === 0) return null
  return (
    <div>
      <SectionLabel right={formatBRL(total)}>Despesas por forma de pagamento</SectionLabel>
      <div className={css({ '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' } })}>
        {items.map(({ method, total: t }, i) => (
          <MethodRow
            key={method}
            index={i}
            icon={METHOD_ICON[method]}
            name={method === 'none' ? 'Não informado' : PAYMENT_METHODS[method]}
            amount={formatBRL(t)}
            share={total > 0 ? t / total : 0}
          />
        ))}
      </div>
    </div>
  )
}

/** Same layout as a category row, but neutral: a payment method has no income/expense side */
function MethodRow({ icon, name, amount, share, index }: { icon: string; name: string; amount: string; share: number; index: number }) {
  const pct = Math.round(share * 100)
  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '3', py: '3' })}>
      <div className={css({ w: '9', h: '9', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16', flexShrink: '0' })} aria-hidden>{icon}</div>
      <div className={css({ flex: '1', minW: '0' })}>
        <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
          <span className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{name}</span>
          <span className={cx(css({ fontSize: '15', fontWeight: 'bold', color: 'ink', flexShrink: '0' }), nums)}>{amount}</span>
        </div>
        <div className={css({ mt: '2', display: 'flex', alignItems: 'center', gap: '3' })}>
          <div className={css({ flex: '1', h: '1', rounded: 'full', bg: 'border', overflow: 'hidden' })}>
            <div className={cx(css({ h: 'full', rounded: 'full', bg: 'ink' }), barGrow)} style={{ width: `${Math.max(pct, 2)}%`, animationDelay: `${index * 40}ms` }} />
          </div>
          <span className={cx(css({ fontSize: '12', color: 'muted', w: '9', textAlign: 'right' }), nums)}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}
