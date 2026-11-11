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
import { css, cx } from '../../../styled-system/css'
import { barGrow, noScrollbar, nums, pbScreen, slideUp } from '../../shared/ui/atoms'


const STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  open:    { label: 'Aberta',    tone: css({ color: 'ink' }) },
  closed:  { label: 'Fechada',   tone: css({ color: 'ink' }) },
  partial: { label: 'Parcial',   tone: css({ color: 'ink' }) },
  paid:    { label: 'Paga',      tone: css({ color: 'muted' }) },
  overdue: { label: 'Vencida',   tone: css({ color: 'expense' }) },
  future:  { label: 'Futura',    tone: css({ color: 'muted' }) },
  empty:   { label: 'Sem gastos', tone: css({ color: 'muted' }) },
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

  if (data === undefined) return <div className={css({ flex: '1' })} />
  if (data === null) {
    return (
      <div className={css({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3', p: '8' })}>
        <p className={css({ fontSize: '14', color: 'muted', m: '0' })}>Cartão não encontrado.</p>
        <button onClick={onBack} className={css({ h: '9', px: '4', rounded: 'full', borderWidth: '1px', borderColor: 'border', fontSize: '13', fontWeight: 'semibold' })}>Voltar</button>
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
    <div className={cx(pbScreen, css({ flex: '1', overflowY: 'auto' }))}>
      <div className={css({ md: { maxW: '[680px]', mx: 'auto', px: '10', pt: '8' } })}>

        {/* Header */}
        <div className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '3', md: { px: '0', h: 'auto', mb: '6' }, h: '14' })}>
          <button onClick={onBack} aria-label="Voltar" className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'border/60' } })}>
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <AccountIcon account={card} size={36} />
          <div className={css({ minW: '0' })}>
            <h1 className={css({ m: '0', fontSize: '17', md: { fontSize: '22' }, fontWeight: 'semibold', letterSpacing: 'title', color: 'ink', truncate: true })}>{card.name}</h1>
            <div className={css({ fontSize: '12', color: 'muted', truncate: true })}>
              {bank ? `${bank.name} · ` : ''}fecha dia {card.card?.closingDay} · vence dia {card.card?.dueDay}
            </div>
          </div>
        </div>

        {/* Debt and limit */}
        <section className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', px: '5', py: '4' })}>
          <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
            <span className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Dívida total</span>
            <span className={cx(css({ fontSize: '17', fontWeight: 'bold', color: 'ink' }), nums)}>{formatBRL(Math.max(debt, 0))}</span>
          </div>
          <p className={css({ m: '0', mt: '0.5', fontSize: '12', color: 'muted' })}>inclui as parcelas futuras</p>
          {limit !== undefined && usedPct !== null && (
            <>
              <div className={css({ mt: '3', h: '1.5', rounded: 'full', bg: 'border', overflow: 'hidden' })}>
                <div className={cx(css({ h: 'full', rounded: 'full', bg: 'ink' }), barGrow)} style={{ width: `${usedPct}%` }} />
              </div>
              <div className={cx(css({ mt: '1.5', display: 'flex', justifyContent: 'space-between', fontSize: '12', color: 'muted' }), nums)}>
                <span>{usedPct}% do limite de {formatBRL(limit)}</span>
                <span className={css(available !== null && available < 0 ? { color: 'expense', fontWeight: 'semibold' } : { color: 'ink', fontWeight: 'semibold' })}>
                  disponível {available !== null && available < 0 ? '−' : ''}{formatBRL(Math.abs(available ?? 0))}
                </span>
              </div>
            </>
          )}
        </section>

        {/* Invoice timeline */}
        <div className={css({ mt: '5', px: '5', md: { px: '0' }, fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '2' })}>Faturas</div>
        <div className={cx(css({ display: 'flex', gap: '2', overflowX: 'auto', px: '5', md: { px: '0' }, pb: '1' }), noScrollbar)} role="tablist" aria-label="Faturas">
          {invoices.map(inv => {
            const isActive = inv.invoiceMonth === active?.invoiceMonth
            const st = STATUS[inv.status]
            return (
              <button
                key={inv.invoiceMonth}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelected(inv.invoiceMonth)}
                className={css({ flexShrink: '0', w: '[92px]', rounded: 'xl', borderWidth: '1px', px: '3', py: '2.5', textAlign: 'left', transition: 'colors' }, isActive ? { bg: 'ink', borderColor: 'ink', color: 'bg' } : { bg: 'surface', borderColor: 'border', _hover: { borderColor: 'muted/40' } })}
              >
                <div className={css({ fontSize: '12', fontWeight: 'semibold' }, isActive ? { color: 'bg' } : { color: 'ink' })}>
                  {formatMonthAbbr(inv.invoiceMonth)}{inv.invoiceMonth.slice(0, 4) !== currentInvoice.slice(0, 4) ? ` ${inv.invoiceMonth.slice(2, 4)}` : ''}
                  {inv.invoiceMonth === currentInvoice && <span className={css({ fontWeight: 'normal', opacity: '0.7' })}> · atual</span>}
                </div>
                <div className={cx(css({ mt: '0.5', fontSize: '13', fontWeight: 'bold', truncate: true }, isActive ? { color: 'bg' } : { color: 'ink' }), nums)}>{formatBRL(inv.total)}</div>
                <div className={cx(css({ fontSize: '11' }), isActive ? css({ color: 'bg/70' }) : st.tone)}>{st.label}</div>
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
    <section className={cx(css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' }), slideUp)}>
      <div className={css({ px: '5', pt: '5', pb: '4' })}>
        <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
          <h2 className={css({ m: '0', fontSize: '15', fontWeight: 'semibold', color: 'ink' })}>Fatura de {monthName}</h2>
          <span className={cx(css({ fontSize: '12', fontWeight: 'semibold' }), st.tone)}>{st.label}</span>
        </div>
        <div className={cx(css({ fontSize: '12', color: 'muted', mt: '0.5' }), nums)}>fecha {formatDayMonthNumeric(invoice.closingDate)} · vence {formatDayMonthNumeric(invoice.dueDate)}</div>

        <div className={cx(css({ mt: '4', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '2' }), nums)}>
          <Figure label="Total" value={formatBRL(invoice.total)} />
          <Figure label="Pago" value={formatBRL(invoice.paid)} />
          <Figure label={invoice.remaining < 0 ? 'Crédito' : 'Restante'} value={formatBRL(Math.abs(invoice.remaining))} strong />
        </div>

        {invoice.remaining > 0 && !paying && (
          <button
            onClick={() => setPaying(true)}
            className={css({ mt: '4', w: 'full', h: '12', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '15', fontWeight: 'bold', _hover: { opacity: '0.9' }, transition: 'opacity' })}
          >
            Pagar fatura
          </button>
        )}
        {paying && (
          <PayForm invoice={invoice} cardId={cardId} defaultFrom={defaultFrom} onDone={() => setPaying(false)} />
        )}
      </div>

      {(invoice.items.length > 0 || invoice.payments.length > 0) && (
        <ul className={css({ m: '0', p: '0', listStyle: 'none', borderTopWidth: '1px', borderColor: 'border' })}>
          {invoice.items.map(({ tx, purchase, category }) => {
            const isRefund = tx.type === 'refund'
            return (
              <li key={tx.id}>
                <button
                  onClick={() => isRefund ? onEdit({ kind: 'tx', id: tx.id as number }) : tx.purchaseId && onEdit({ kind: 'purchase', id: tx.purchaseId })}
                  className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '3', px: '5', py: '3', textAlign: 'left', _hover: { bg: 'bg/60' }, borderBottomWidth: '1px', borderColor: 'border' })}
                >
                  <div className={css({ w: '9', h: '9', rounded: 'tile' }, isRefund ? { bg: 'border/60' } : { bg: 'expense.light' }, { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16', flexShrink: '0' })} aria-hidden>{category?.icon}</div>
                  <div className={css({ flex: '1', minW: '0' })}>
                    <div className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{isRefund ? tx.description : purchase?.description || category?.name}</div>
                    <div className={cx(css({ fontSize: '12', color: 'muted', truncate: true }), nums)}>
                      {isRefund ? `Estorno · ${formatDayMonthNumeric(tx.date)}` : <>
                        {(tx.installments ?? 1) > 1 ? `${tx.installment}/${tx.installments} · ` : ''}compra {formatDayMonthNumeric(tx.date)}
                        {purchase && (tx.installments ?? 1) > 1 ? ` · total ${formatBRL(purchase.total)}` : ''}
                      </>}
                    </div>
                  </div>
                  <div className={cx(css({ fontSize: '15', fontWeight: 'bold', flexShrink: '0' }, isRefund ? { color: 'ink' } : { color: 'expense' }), nums)}>{isRefund ? '+' : '−'}{formatBRL(tx.amount)}</div>
                </button>
              </li>
            )
          })}
          {invoice.payments.map(p => (
            <li key={p.id}>
              <button
                onClick={() => onEdit({ kind: 'transfer', id: p.id as number })}
                className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '3', px: '5', py: '3', textAlign: 'left', _hover: { bg: 'bg/60' }, borderBottomWidth: '1px', borderColor: 'border' })}
              >
                <div className={css({ w: '9', h: '9', rounded: 'tile', bg: 'border/60', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'ink', flexShrink: '0' })} aria-hidden>
                  <ArrowLeftRight size={16} strokeWidth={1.75} />
                </div>
                <div className={css({ flex: '1', minW: '0' })}>
                  <div className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{p.description || 'Pagamento'}</div>
                  <div className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>{formatDayMonthNumeric(p.date)}</div>
                </div>
                <div className={cx(css({ fontSize: '15', fontWeight: 'bold', color: 'ink', flexShrink: '0' }), nums)}>+{formatBRL(p.amount)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {invoice.items.length === 0 && invoice.payments.length === 0 && (
        <p className={css({ m: '0', px: '5', pb: '5', fontSize: '13', color: 'muted' })}>Nenhuma compra nesta fatura.</p>
      )}
    </section>
  )
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={css({ minW: '0' })}>
      <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted' })}>{label}</div>
      <div className={css({ fontSize: '15', truncate: true }, strong ? { fontWeight: 'bold', color: 'ink' } : { fontWeight: 'semibold', color: 'ink' })}>{value}</div>
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
    <div className={cx(css({ mt: '4', mx: '-5', px: '0', pt: '4', borderTopWidth: '1px', borderColor: 'border' }), slideUp)}>
      <div className={css({ px: '5', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '2' })}>Pagar com</div>
      <AccountChips label="Conta de pagamento" accounts={banks} value={fromId} onChange={setFrom} />
      <div className={css({ px: '5', mt: '3', display: 'flex', alignItems: 'center', gap: '2' })}>
        <div className={css({ flex: '1', minW: '0', h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', display: 'flex', alignItems: 'center', gap: '1.5', _focusWithin: { borderColor: 'muted/60' } })}>
          <span className={css({ fontSize: '14', fontWeight: 'semibold', color: 'muted' })}>R$</span>
          <input
            inputMode="numeric"
            aria-label="Valor do pagamento"
            value={display}
            onChange={e => setDigits(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))}
            className={cx(css({ flex: '1', minW: '0', bg: 'transparent', fontSize: '15', fontWeight: 'semibold', color: 'ink', outline: 'none' }), nums)}
          />
        </div>
        <input
          type="date"
          aria-label="Data do pagamento"
          value={date}
          onChange={e => setDate(e.target.value)}
          className={cx(css({ w: '[150px]', flexShrink: '0', h: '11', px: '2.5', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none' }), nums)}
        />
      </div>
      <p className={css({ px: '5', mt: '1.5', mb: '0', fontSize: '12', color: 'muted' })}>
        Sai da conta escolhida e abate a fatura. Não conta como despesa — as compras já contaram.
      </p>
      {error && <p className={css({ px: '5', mt: '2', mb: '0', fontSize: '13', color: 'expense' })} role="alert">{error}</p>}
      <div className={css({ px: '5', mt: '3', display: 'flex', gap: '2' })}>
        <button onClick={onDone} className={css({ flex: '1', h: '11', rounded: 'xl', borderWidth: '1px', borderColor: 'border', fontSize: '14', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' } })}>Cancelar</button>
        <button
          onClick={() => void pay()}
          disabled={busy || !digits || fromId === null}
          className={css({ flex: '1', h: '11', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '14', fontWeight: 'bold', _disabled: { opacity: '0.4' } })}
        >
          {busy ? 'Pagando...' : `Pagar ${display ? `R$ ${display}` : ''}`}
        </button>
      </div>
    </div>
  )
}
