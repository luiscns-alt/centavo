import { useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react'
import { formatBRL, toISODate, type PaymentMethod } from '../../core/db'
import { groupKeyOf, rowDelta, useTransactionList, type InvoiceGroupInfo, type LedgerRow } from './useTransactionList'
import { useAccounts, AccountFilter, type AccountScope, AccountIcon } from '../accounts'
import { PAYMENT_METHODS } from '../../core/ledger/base'
import type { MonthNav } from '../../shared/ui/MonthSelector'
import type { EditTarget } from './AddTransactionForm'
import { ScreenHeader } from '../../shared/ui/ScreenHeader'
import { TransactionRow } from './TransactionRow'
import { EmptyState } from '../../shared/ui/EmptyState'
import { MobileHeader } from '../../shared/ui/MobileHeader'

const MONTH_NAMES_LC = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

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

const shortDate = (iso: string) => `${Number(iso.slice(8))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`

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
  const monthLc = MONTH_NAMES_LC[nav.month - 1]

  return (
    <div className="flex-1 overflow-y-auto pb-28 md:pb-12">
      <MobileHeader />

      <div className="md:max-w-[680px] md:mx-auto md:px-10 md:pt-8">
        <ScreenHeader title="Lançamentos" nav={nav} filter={<AccountFilter value={account.selection} onChange={account.setSelection} />} />

        {rows.length > 0 && (
          <div className="px-5 md:px-0 mt-2 md:mt-0 mb-2 flex items-center gap-2 flex-wrap">
            <div className="inline-flex bg-border/70 rounded-full p-0.5 overflow-x-auto no-scrollbar max-w-full" role="tablist" aria-label="Filtrar lançamentos">
              {filters.map(f => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active === f.id}
                  onClick={() => setFilter(f.id)}
                  className={[
                    'h-8 px-3.5 rounded-full text-[13px] font-semibold transition-colors whitespace-nowrap',
                    active === f.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {methodsHere.length > 1 && (
              <label className="relative inline-flex items-center gap-1 h-9 pl-3 pr-2 rounded-full border border-border bg-surface text-[13px] font-semibold text-ink cursor-pointer">
                {method ? PAYMENT_METHODS[method] : 'Forma: todas'}
                <ChevronDown size={14} strokeWidth={2} className="text-muted" />
                <select
                  aria-label="Filtrar por forma de pagamento"
                  value={method}
                  onChange={e => setMethod(e.target.value as PaymentMethod | '')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                >
                  <option value="">Todas as formas</option>
                  {methodsHere.map(m => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}
                </select>
              </label>
            )}
            <span className="ml-auto text-[12px] text-muted nums whitespace-nowrap">
              {visible.length} {visible.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
        )}

        <div className="px-5 md:px-0">
          {loading && <div className="py-16 text-center text-muted opacity-30 text-[14px]">–</div>}

          {!loading && rows.length === 0 && (
            <div className="md:bg-surface md:border md:border-border md:rounded-2xl">
              <EmptyState
                title={`Nenhum lançamento em ${monthLc}`}
                description="Tudo o que entrar, sair, mudar de conta ou cair na fatura do cartão aparece aqui."
                actionLabel="Novo lançamento"
                onAction={onAdd}
              />
            </div>
          )}

          {!loading && rows.length > 0 && visible.length === 0 && (
            <p className="text-[14px] text-muted text-center py-14">Nada desse tipo em {monthLc}.</p>
          )}

          <div className="flex flex-col gap-4 md:gap-5">
            {groups.map(g => {
              const inv = invoices.get(g.key)
              return (
                <section key={g.key} className="slide-up">
                  {inv
                    ? <InvoiceHeader info={inv} total={-g.net} onOpen={() => onOpenCard(inv.card.id as number)} />
                    : (
                      <div className="flex items-baseline justify-between pt-3 pb-1 md:px-1">
                        <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[.08em] text-muted">{dayLabel(g.key)}</h2>
                        <span className="text-[12px] text-muted nums">
                          {g.net > 0 ? '+' : g.net < 0 ? '−' : ''}{formatBRL(Math.abs(g.net))}
                        </span>
                      </div>
                    )}
                  <div className="md:bg-surface md:border md:border-border md:rounded-2xl md:px-5">
                    {g.rows.map(row => (
                      <button
                        key={row.key}
                        onClick={() => {
                          const loanId = row.kind === 'tx' ? row.loanId : row.transfer.loanId
                          if (loanId !== undefined) onOpenLoan(loanId)
                          else onEdit(targetOf(row))
                        }}
                        className="block w-full text-left hover:bg-bg/60 transition-colors border-b border-border last:border-0"
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
                              row.tx.invoiceMonth ? `compra ${shortDate(row.tx.date)}` : null,
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
    <button onClick={onOpen} className="w-full flex items-center gap-2 pt-3 pb-1.5 md:px-1 text-left group">
      <AccountIcon account={info.card} size="inline" />
      <h2 className="m-0 flex-1 min-w-0 truncate text-[12px] font-semibold uppercase tracking-[.08em] text-muted group-hover:text-ink">
        Fatura {info.card.name} · vence {shortDate(info.dueDate)}
      </h2>
      <span className="text-[12px] text-muted nums">−{formatBRL(Math.abs(total))}</span>
      <ChevronRight size={14} strokeWidth={2} className="text-muted" />
    </button>
  )
}

/** Transfers are neutral: no income/expense color, ⇄ instead of a category emoji */
function TransferRow({ row, ids }: { row: Extract<LedgerRow, { kind: 'transfer' }>; ids: number[] | null }) {
  const delta = rowDelta(row, ids)
  const route = `${row.from?.name ?? '?'} → ${row.to?.name ?? '?'}`
  const isPayment = row.transfer.invoiceMonth !== undefined
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-9 h-9 rounded-[10px] bg-border/60 flex items-center justify-center text-ink shrink-0" aria-hidden>
        <ArrowLeftRight size={16} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-ink truncate leading-snug">
          {row.transfer.description || (isPayment ? 'Pagamento de fatura' : 'Transferência')}
        </div>
        <div className="text-[12px] text-muted truncate">{route}</div>
      </div>
      <div className="text-[15px] font-bold nums shrink-0 text-ink">
        {delta > 0 ? '+' : delta < 0 ? '−' : ''}{formatBRL(row.transfer.amount)}
      </div>
    </div>
  )
}
