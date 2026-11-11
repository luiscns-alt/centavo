import { useState } from 'react'
import { ArrowLeftRight, ChevronLeft } from 'lucide-react'
import { useCardData, type Invoice } from './useInvoices'
import { useAccounts, AccountIcon, AccountChips } from '../accounts'
import { LedgerError, isCashAccount } from '../../core/ledger/base'
import { payInvoice } from './ledger'
import type { InvoiceStatus } from './invoice'
import type { EditTarget } from '../transactions'
import { todayISO, formatDayMonthNumeric, formatMonthAbbr, formatMonthName } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'


const STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  open:    { label: 'Aberta',    tone: 'text-ink' },
  closed:  { label: 'Fechada',   tone: 'text-ink' },
  partial: { label: 'Parcial',   tone: 'text-ink' },
  paid:    { label: 'Paga',      tone: 'text-muted' },
  overdue: { label: 'Vencida',   tone: 'text-expense' },
  future:  { label: 'Futura',    tone: 'text-muted' },
  empty:   { label: 'Sem gastos', tone: 'text-muted' },
}

interface Props {
  cardId: number
  onBack: () => void
  onEdit: (target: EditTarget) => void
}

/** A card's invoices as a timeline — past, current, and future (installments already booked) */
export function CardView({ cardId, onBack, onEdit }: Props) {
  const data = useCardData(cardId)
  const [selected, setSelected] = useState<string | null>(null)

  if (data === undefined) return <div className="flex-1" />
  if (data === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
        <p className="text-[14px] text-muted m-0">Cartão não encontrado.</p>
        <button onClick={onBack} className="h-9 px-4 rounded-full border border-border text-[13px] font-semibold">Voltar</button>
      </div>
    )
  }

  const { card, bank, invoices, currentInvoice, debt, available } = data
  // Default: the oldest closed invoice still owing, else the current one
  const owing = invoices.find(i => i.invoiceMonth < currentInvoice && i.remaining > 0)
  const active = invoices.find(i => i.invoiceMonth === (selected ?? owing?.invoiceMonth ?? currentInvoice)) ?? invoices[0]
  const limit = card.card?.limit
  const usedPct = limit ? Math.min(100, Math.max(0, Math.round((debt / limit) * 100))) : null

  return (
    <div className="flex-1 overflow-y-auto pb-28 md:pb-12">
      <div className="md:max-w-[680px] md:mx-auto md:px-10 md:pt-8">

        {/* Header */}
        <div className="flex items-center gap-3 px-3 md:px-0 h-14 md:h-auto md:mb-6">
          <button onClick={onBack} aria-label="Voltar" className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-border/60">
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <AccountIcon account={card} size={36} />
          <div className="min-w-0">
            <h1 className="m-0 text-[17px] md:text-[22px] font-semibold tracking-[-.01em] text-ink truncate">{card.name}</h1>
            <div className="text-[12px] text-muted truncate">
              {bank ? `${bank.name} · ` : ''}fecha dia {card.card?.closingDay} · vence dia {card.card?.dueDay}
            </div>
          </div>
        </div>

        {/* Debt and limit */}
        <section className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Dívida total</span>
            <span className="text-[17px] font-bold nums text-ink">{formatBRL(Math.max(debt, 0))}</span>
          </div>
          <p className="m-0 mt-0.5 text-[12px] text-muted">inclui as parcelas futuras</p>
          {limit !== undefined && usedPct !== null && (
            <>
              <div className="mt-3 h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-ink bar-grow" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[12px] text-muted nums">
                <span>{usedPct}% do limite de {formatBRL(limit)}</span>
                <span className={available !== null && available < 0 ? 'text-expense font-semibold' : 'text-ink font-semibold'}>
                  disponível {available !== null && available < 0 ? '−' : ''}{formatBRL(Math.abs(available ?? 0))}
                </span>
              </div>
            </>
          )}
        </section>

        {/* Invoice timeline */}
        <div className="mt-5 px-5 md:px-0 text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2">Faturas</div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 md:px-0 pb-1" role="tablist" aria-label="Faturas">
          {invoices.map(inv => {
            const isActive = inv.invoiceMonth === active?.invoiceMonth
            const st = STATUS[inv.status]
            return (
              <button
                key={inv.invoiceMonth}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelected(inv.invoiceMonth)}
                className={[
                  'shrink-0 w-[92px] rounded-xl border px-3 py-2.5 text-left transition-colors',
                  isActive ? 'bg-ink border-ink text-bg' : 'bg-surface border-border hover:border-muted/40',
                ].join(' ')}
              >
                <div className={`text-[12px] font-semibold ${isActive ? 'text-bg' : 'text-ink'}`}>
                  {formatMonthAbbr(inv.invoiceMonth)}{inv.invoiceMonth.slice(0, 4) !== currentInvoice.slice(0, 4) ? ` ${inv.invoiceMonth.slice(2, 4)}` : ''}
                  {inv.invoiceMonth === currentInvoice && <span className="font-normal opacity-70"> · atual</span>}
                </div>
                <div className={`mt-0.5 text-[13px] font-bold nums truncate ${isActive ? 'text-bg' : 'text-ink'}`}>{formatBRL(inv.total)}</div>
                <div className={`text-[11px] ${isActive ? 'text-bg/70' : st.tone}`}>{st.label}</div>
              </button>
            )
          })}
        </div>

        {active && <InvoicePanel key={active.invoiceMonth} invoice={active} cardId={cardId} defaultFrom={card.card?.bankAccountId ?? null} onEdit={onEdit} />}
      </div>
    </div>
  )
}

function InvoicePanel({ invoice, cardId, defaultFrom, onEdit }: {
  invoice: Invoice; cardId: number; defaultFrom: number | null; onEdit: (t: EditTarget) => void
}) {
  const [paying, setPaying] = useState(false)
  const st = STATUS[invoice.status]
  const monthName = formatMonthName(invoice.invoiceMonth)

  return (
    <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl slide-up">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="m-0 text-[15px] font-semibold text-ink">Fatura de {monthName}</h2>
          <span className={`text-[12px] font-semibold ${st.tone}`}>{st.label}</span>
        </div>
        <div className="text-[12px] text-muted mt-0.5 nums">fecha {formatDayMonthNumeric(invoice.closingDate)} · vence {formatDayMonthNumeric(invoice.dueDate)}</div>

        <div className="mt-4 grid grid-cols-3 gap-2 nums">
          <Figure label="Total" value={formatBRL(invoice.total)} />
          <Figure label="Pago" value={formatBRL(invoice.paid)} />
          <Figure label={invoice.remaining < 0 ? 'Crédito' : 'Restante'} value={formatBRL(Math.abs(invoice.remaining))} strong />
        </div>

        {invoice.remaining > 0 && !paying && (
          <button
            onClick={() => setPaying(true)}
            className="mt-4 w-full h-12 rounded-xl bg-ink text-bg text-[15px] font-bold hover:opacity-90 transition-opacity"
          >
            Pagar fatura
          </button>
        )}
        {paying && (
          <PayForm invoice={invoice} cardId={cardId} defaultFrom={defaultFrom} onDone={() => setPaying(false)} />
        )}
      </div>

      {(invoice.items.length > 0 || invoice.payments.length > 0) && (
        <ul className="m-0 p-0 list-none border-t border-border">
          {invoice.items.map(({ tx, purchase, category }) => {
            const isRefund = tx.type === 'refund'
            return (
              <li key={tx.id}>
                <button
                  onClick={() => isRefund ? onEdit({ kind: 'tx', id: tx.id as number }) : tx.purchaseId && onEdit({ kind: 'purchase', id: tx.purchaseId })}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-bg/60 border-b border-border"
                >
                  <div className={`w-9 h-9 rounded-[10px] ${isRefund ? 'bg-border/60' : 'bg-expense-light'} flex items-center justify-center text-[16px] shrink-0`} aria-hidden>{category?.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-ink truncate">{isRefund ? tx.description : purchase?.description || category?.name}</div>
                    <div className="text-[12px] text-muted truncate nums">
                      {isRefund ? `Estorno · ${formatDayMonthNumeric(tx.date)}` : <>
                        {(tx.installments ?? 1) > 1 ? `${tx.installment}/${tx.installments} · ` : ''}compra {formatDayMonthNumeric(tx.date)}
                        {purchase && (tx.installments ?? 1) > 1 ? ` · total ${formatBRL(purchase.total)}` : ''}
                      </>}
                    </div>
                  </div>
                  <div className={`text-[15px] font-bold nums shrink-0 ${isRefund ? 'text-ink' : 'text-expense'}`}>{isRefund ? '+' : '−'}{formatBRL(tx.amount)}</div>
                </button>
              </li>
            )
          })}
          {invoice.payments.map(p => (
            <li key={p.id}>
              <button
                onClick={() => onEdit({ kind: 'transfer', id: p.id as number })}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-bg/60 border-b border-border"
              >
                <div className="w-9 h-9 rounded-[10px] bg-border/60 flex items-center justify-center text-ink shrink-0" aria-hidden>
                  <ArrowLeftRight size={16} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate">{p.description || 'Pagamento'}</div>
                  <div className="text-[12px] text-muted nums">{formatDayMonthNumeric(p.date)}</div>
                </div>
                <div className="text-[15px] font-bold nums text-ink shrink-0">+{formatBRL(p.amount)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {invoice.items.length === 0 && invoice.payments.length === 0 && (
        <p className="m-0 px-5 pb-5 text-[13px] text-muted">Nenhuma compra nesta fatura.</p>
      )}
    </section>
  )
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">{label}</div>
      <div className={`text-[15px] truncate ${strong ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{value}</div>
    </div>
  )
}

/** One transfer from a bank account to the card, tagged with the invoice */
function PayForm({ invoice, cardId, defaultFrom, onDone }: { invoice: Invoice; cardId: number; defaultFrom: number | null; onDone: () => void }) {
  const accounts = useAccounts()
  const banks = accounts?.filter(a => !a.archived && isCashAccount(a)) ?? []
  const [digits, setDigits] = useState(String(invoice.remaining))
  const [from, setFrom] = useState<number | null>(defaultFrom)
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fromId = banks.some(a => a.id === from) ? from : (banks[0]?.id ?? null)
  const display = digits ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(Number(digits) / 100) : ''

  async function pay() {
    if (fromId === null) return setError('Cadastre uma conta para pagar.')
    setBusy(true)
    setError(null)
    try {
      await payInvoice({
        cardAccountId: cardId, invoiceMonth: invoice.invoiceMonth, fromAccountId: fromId,
        amount: Number(digits), date, description: `Fatura ${formatMonthAbbr(invoice.invoiceMonth)}/${invoice.invoiceMonth.slice(0, 4)}`,
      })
      onDone()
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível registrar o pagamento.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 -mx-5 px-0 pt-4 border-t border-border slide-up">
      <div className="px-5 text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2">Pagar com</div>
      <AccountChips label="Conta de pagamento" accounts={banks} value={fromId} onChange={setFrom} />
      <div className="px-5 mt-3 flex items-center gap-2">
        <div className="flex-1 min-w-0 h-11 px-3 rounded-[10px] border border-border bg-bg flex items-center gap-1.5 focus-within:border-muted/60">
          <span className="text-[14px] font-semibold text-muted">R$</span>
          <input
            inputMode="numeric"
            aria-label="Valor do pagamento"
            value={display}
            onChange={e => setDigits(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))}
            className="flex-1 min-w-0 bg-transparent text-[15px] font-semibold nums text-ink outline-none"
          />
        </div>
        <input
          type="date"
          aria-label="Data do pagamento"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-[150px] shrink-0 h-11 px-2.5 rounded-[10px] border border-border bg-bg text-[14px] nums text-ink outline-none"
        />
      </div>
      <p className="px-5 mt-1.5 mb-0 text-[12px] text-muted">
        Sai da conta escolhida e abate a fatura. Não conta como despesa — as compras já contaram.
      </p>
      {error && <p className="px-5 mt-2 mb-0 text-[13px] text-expense" role="alert">{error}</p>}
      <div className="px-5 mt-3 flex gap-2">
        <button onClick={onDone} className="flex-1 h-11 rounded-xl border border-border text-[14px] font-semibold text-ink hover:bg-bg">Cancelar</button>
        <button
          onClick={() => void pay()}
          disabled={busy || !digits || fromId === null}
          className="flex-1 h-11 rounded-xl bg-ink text-bg text-[14px] font-bold disabled:opacity-40"
        >
          {busy ? 'Pagando...' : `Pagar ${display ? `R$ ${display}` : ''}`}
        </button>
      </div>
    </div>
  )
}
