import { useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react'
import { groupKeyOf, rowDelta, useTransactionList, type InvoiceGroupInfo, type LedgerRow } from './useTransactionList'
import { useAccounts, AccountFilter, type AccountScope, AccountIcon } from '../accounts'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import type { EditTarget } from './AddTransactionForm'
import { ScreenHeader } from '../../shared/ui/ScreenHeader'
import { TransactionRow } from './TransactionRow'
import { EmptyState } from '../../shared/ui/EmptyState'
import { MobileHeader } from '../../shared/ui/MobileHeader'
import { PAYMENT_METHODS } from '../../core/constants/domain'
import type { PaymentMethod } from '../../core/types'
import { toISODate, MONTH_LONG, formatDayMonth } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'
import { css, cx } from '../../../styled-system/css'
import { noScrollbar, nums, pbScreen, slideUp } from '../../shared/ui/atoms'


type Filter = 'all' | 'income' | 'expense' | 'transfer'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',      label: 'Todos' },
  { id: 'expense',  label: 'Despesas' },
  { id: 'income',   label: 'Receitas' },
  { id: 'transfer', label: 'Transf.' },
]

interface Props {
  nav: MonthNav
  account: AccountScope
  onAdd: () => void
  onEdit: (target: EditTarget) => void
  onOpenCard: (id: number) => void
  onOpenLoan: (id: number) => void
}

/** "Hoje", "Ontem" or "seg, 9 nov" */
function dayLabel(iso: string): string {
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (iso === toISODate(today)) return 'Hoje'
  if (iso === toISODate(yesterday)) return 'Ontem'
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(y, m - 1, d))
    .replaceAll('.', '')
}


function matches(row: LedgerRow, f: Filter, method: PaymentMethod | '') {
  if (method && (row.kind !== 'tx' || row.tx.method !== method)) return false
  if (f === 'all') return true
  if (f === 'transfer') return row.kind === 'transfer'
  // Refunds sit with Despesas: they reduce spending
  return row.kind === 'tx' && (row.tx.type === f || (f === 'expense' && row.tx.type === 'refund'))
}

/** Consecutive rows with the same group (a day, or a card invoice) */
function group(rows: LedgerRow[], ids: number[] | null) {
  const groups: { key: string; rows: LedgerRow[]; net: number }[] = []
  for (const row of rows) {
    const key = groupKeyOf(row)
    let g = groups.find(x => x.key === key)
    if (!g) {
      g = { key, rows: [], net: 0 }
      groups.push(g)
    }
    g.rows.push(row)
    g.net += rowDelta(row, ids)
  }
  return groups
}

const targetOf = (row: LedgerRow): EditTarget =>
  row.kind === 'transfer'
    ? { kind: 'transfer', id: row.transfer.id as number }
    : row.tx.purchaseId !== undefined
      ? { kind: 'purchase', id: row.tx.purchaseId }
      : { kind: 'tx', id: row.tx.id as number }

export function TransactionList({ nav, account, onAdd, onEdit, onOpenCard, onOpenLoan }: Props) {
  const { ids } = account
  const { rows, invoices, loading } = useTransactionList(nav.year, nav.month, ids)
  const accounts = useAccounts()
  const [filter, setFilter] = useState<Filter>('all')
  const [method, setMethod] = useState<PaymentMethod | ''>('')

  const multiAccount = (accounts?.length ?? 0) > 1
  const hasTransfers = rows.some(r => r.kind === 'transfer')
  const filters = FILTERS.filter(f => f.id !== 'transfer' || hasTransfers)
  const active = filters.some(f => f.id === filter) ? filter : 'all'
  const methodsHere = [...new Set(rows.flatMap(r => (r.kind === 'tx' && r.tx.method ? [r.tx.method] : [])))]
  const visible = rows.filter(r => matches(r, active, method))
  const groups = group(visible, ids)
  const monthLc = MONTH_LONG[nav.month - 1]

  return (
    <div className={cx(pbScreen, css({ flex: '1', overflowY: 'auto' }))}>
      <MobileHeader />

      <div className={css({ md: { maxW: '[680px]', mx: 'auto', px: '10', pt: '8' } })}>
        <ScreenHeader title="Lançamentos" nav={nav} filter={<AccountFilter value={account.selection} onChange={account.setSelection} />} />

        {rows.length > 0 && (
          <div className={css({ px: '5', md: { px: '0', mt: '0' }, mt: '2', mb: '2', display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })}>
            <div className={cx(css({ display: 'inline-flex', bg: 'border/70', rounded: 'full', p: '0.5', overflowX: 'auto', maxW: 'full' }), noScrollbar)} role="tablist" aria-label="Filtrar lançamentos">
              {filters.map(f => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active === f.id}
                  onClick={() => setFilter(f.id)}
                  className={css({ h: '8', px: '3.5', rounded: 'full', fontSize: '13', fontWeight: 'semibold', transition: 'colors', whiteSpace: 'nowrap' }, active === f.id ? { bg: 'surface', color: 'ink', shadow: 'sm' } : { color: 'muted', _hover: { color: 'ink' } })}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {methodsHere.length > 1 && (
              <label className={css({ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '1', h: '9', pl: '3', pr: '2', rounded: 'full', borderWidth: '1px', borderColor: 'border', bg: 'surface', fontSize: '13', fontWeight: 'semibold', color: 'ink', cursor: 'pointer' })}>
                {method ? PAYMENT_METHODS[method] : 'Forma: todas'}
                <ChevronDown size={14} strokeWidth={2} className={css({ color: 'muted' })} />
                <select
                  aria-label="Filtrar por forma de pagamento"
                  value={method}
                  onChange={e => setMethod(e.target.value as PaymentMethod | '')}
                  className={css({ position: 'absolute', inset: '0', opacity: '0', cursor: 'pointer' })}
                >
                  <option value="">Todas as formas</option>
                  {methodsHere.map(m => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}
                </select>
              </label>
            )}
            <span className={cx(css({ ml: 'auto', fontSize: '12', color: 'muted', whiteSpace: 'nowrap' }), nums)}>
              {visible.length} {visible.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
        )}

        <div className={css({ px: '5', md: { px: '0' } })}>
          {loading && <div className={css({ py: '16', textAlign: 'center', color: 'muted', opacity: '0.3', fontSize: '14' })}>–</div>}

          {!loading && rows.length === 0 && (
            <div className={css({ md: { bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' } })}>
              <EmptyState
                title={`Nenhum lançamento em ${monthLc}`}
                description="Tudo o que entrar, sair, mudar de conta ou cair na fatura do cartão aparece aqui."
                actionLabel="Novo lançamento"
                onAction={onAdd}
              />
            </div>
          )}

          {!loading && rows.length > 0 && visible.length === 0 && (
            <p className={css({ fontSize: '14', color: 'muted', textAlign: 'center', py: '14' })}>Nada desse tipo em {monthLc}.</p>
          )}

          <div className={css({ display: 'flex', flexDirection: 'column', gap: '4', md: { gap: '5' } })}>
            {groups.map(g => {
              const inv = invoices.get(g.key)
              return (
                <section key={g.key} className={slideUp}>
                  {inv
                    ? <InvoiceHeader info={inv} total={-g.net} onOpen={() => onOpenCard(inv.card.id as number)} />
                    : (
                      <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', pt: '3', pb: '1', md: { px: '1' } })}>
                        <h2 className={css({ m: '0', fontSize: '12', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted' })}>{dayLabel(g.key)}</h2>
                        <span className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>
                          {g.net > 0 ? '+' : g.net < 0 ? '−' : ''}{formatBRL(Math.abs(g.net))}
                        </span>
                      </div>
                    )}
                  <div className={css({ md: { bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '5' } })}>
                    {g.rows.map(row => (
                      <button
                        key={row.key}
                        onClick={() => {
                          const loanId = row.kind === 'tx' ? row.loanId : row.transfer.loanId
                          if (loanId !== undefined) onOpenLoan(loanId)
                          else onEdit(targetOf(row))
                        }}
                        className={css({ display: 'block', w: 'full', textAlign: 'left', _hover: { bg: 'bg/60' }, transition: 'colors', borderBottomWidth: '1px', borderColor: 'border', _last: { borderWidth: '0' } })}
                        aria-label={`Editar ${row.kind === 'tx' ? (row.tx.description || row.category.name) : 'transferência'}`}
                      >
                        {row.kind === 'tx' ? (
                          <TransactionRow
                            icon={row.category.icon}
                            type={row.tx.type === 'refund' ? 'refund' : row.category.type}
                            title={row.tx.description || row.category.name}
                            subtitle={[
                              row.tx.type === 'refund' && !row.tx.description?.startsWith('Estorno') ? 'Estorno' : null,
                              row.tx.description ? row.category.name : null,
                              row.tx.installments && row.tx.installments > 1 ? `${row.tx.installment}/${row.tx.installments}` : null,
                              row.tx.invoiceMonth ? `compra ${formatDayMonth(row.tx.date)}` : null,
                              !row.tx.invoiceMonth && row.tx.method ? PAYMENT_METHODS[row.tx.method] : null,
                              multiAccount && ids === null && !row.tx.invoiceMonth ? row.account?.name : null,
                            ].filter(Boolean).join(' · ') || undefined}
                            amount={formatBRL(row.tx.amount)}
                            bordered={false}
                          />
                        ) : (
                          <TransferRow row={row} ids={ids} />
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Card installments of the month sit under their invoice, listed on its due date */
function InvoiceHeader({ info, total, onOpen }: { info: InvoiceGroupInfo; total: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={cx(css({ w: 'full', display: 'flex', alignItems: 'center', gap: '2', pt: '3', pb: '1.5', md: { px: '1' }, textAlign: 'left' }), 'group')}>
      <AccountIcon account={info.card} size="inline" />
      <h2 className={css({ m: '0', flex: '1', minW: '0', truncate: true, fontSize: '12', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted', _groupHover: { color: 'ink' } })}>
        Fatura {info.card.name} · vence {formatDayMonth(info.dueDate)}
      </h2>
      <span className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>−{formatBRL(Math.abs(total))}</span>
      <ChevronRight size={14} strokeWidth={2} className={css({ color: 'muted' })} />
    </button>
  )
}

/** Transfers are neutral: no income/expense color, ⇄ instead of a category emoji */
function TransferRow({ row, ids }: { row: Extract<LedgerRow, { kind: 'transfer' }>; ids: number[] | null }) {
  const delta = rowDelta(row, ids)
  const route = `${row.from?.name ?? '?'} → ${row.to?.name ?? '?'}`
  const isPayment = row.transfer.invoiceMonth !== undefined
  return (
    <div className={css({ display: 'flex', alignItems: 'center', gap: '3', py: '3' })}>
      <div className={css({ w: '9', h: '9', rounded: 'tile', bg: 'border/60', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ink', flexShrink: '0' })} aria-hidden>
        <ArrowLeftRight size={16} strokeWidth={1.75} />
      </div>
      <div className={css({ flex: '1', minW: '0' })}>
        <div className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true, lineHeight: 'snug' })}>
          {row.transfer.description || (isPayment ? 'Pagamento de fatura' : 'Transferência')}
        </div>
        <div className={css({ fontSize: '12', color: 'muted', truncate: true })}>{route}</div>
      </div>
      <div className={cx(css({ fontSize: '15', fontWeight: 'bold', flexShrink: '0', color: 'ink' }), nums)}>
        {delta > 0 ? '+' : delta < 0 ? '−' : ''}{formatBRL(row.transfer.amount)}
      </div>
    </div>
  )
}
