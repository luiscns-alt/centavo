import { Fragment, useMemo, useState } from 'react'
import { ChevronLeft, Undo2, Trash2 } from 'lucide-react'
import { LedgerError, isCashAccount } from '../../core/ledger/base'
import { adjustLoanBalance, deleteLoan, payLoanInstallment, prepayLoan, undoLastLoanEvent } from './ledger'
import { monthlyRatePercent, payoffAmount, prepayment, project } from './loanMath'
import { useLoanSchedule, type LoanSchedule, type ScheduleRow } from './useLoans'
import { useAccounts, AccountIcon, AccountChips } from '../accounts'
import { Choice, FieldLabel, MoneyInput } from '../../shared/ui/MoneyInput'
import { ACCOUNT_METHODS, PAYMENT_METHODS, LOAN_TYPES } from '../../core/constants/domain'
import type { PaymentMethod, PrepaymentMode } from '../../core/types'
import { todayISO, formatDate, formatDayMonthNumeric, formatMonthShortYear } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'
import { css, cx } from '../../../styled-system/css'
import { barGrow, nums, pbScreen, slideUp } from '../../shared/ui/atoms'


type Panel = null | 'pay' | 'prepay' | 'adjust'

interface Props {
  loanId: number
  onBack: () => void
}

/** A loan: where it stands, pay / prepay / adjust, and the full schedule grouped by year */
export function LoanView({ loanId, onBack }: Props) {
  const data = useLoanSchedule(loanId)
  const [panel, setPanel] = useState<Panel>(null)
  const [confirm, setConfirm] = useState<null | 'undo' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)

  if (data === undefined) return <div className={css({ flex: '1' })} />
  if (data === null) {
    return (
      <div className={css({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3', p: '8' })}>
        <p className={css({ fontSize: '14', color: 'muted', m: '0' })}>Empréstimo não encontrado.</p>
        <button onClick={onBack} className={css({ h: '9', px: '4', rounded: 'full', borderWidth: '1px', borderColor: 'border', fontSize: '13', fontWeight: 'semibold' })}>Voltar</button>
      </div>
    )
  }

  const { loan, account, summary, last, events } = data
  const progress = Math.round((summary.principalPaid / loan.principal) * 100)
  const settled = summary.outstanding === 0

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null)
    try {
      await action()
      after?.()
      setConfirm(null)
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível concluir.')
    }
  }

  return (
    <div className={cx(pbScreen, css({ flex: '1', overflowY: 'auto' }))}>
      <div className={css({ md: { maxW: '[720px]', mx: 'auto', px: '10', pt: '8' } })}>

        {/* Header */}
        <div className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '3', md: { px: '0', h: 'auto', mb: '6' }, h: '14' })}>
          <button onClick={onBack} aria-label="Voltar" className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'border/60' } })}>
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <AccountIcon account={account} size={36} />
          <div className={css({ minW: '0' })}>
            <h1 className={css({ m: '0', fontSize: '17', md: { fontSize: '22' }, fontWeight: 'semibold', letterSpacing: 'title', color: 'ink', truncate: true })}>{account.name}</h1>
            <div className={cx(css({ fontSize: '12', color: 'muted', truncate: true }), nums)}>
              {LOAN_TYPES[loan.type].label} · {loan.system === 'price' ? 'Price' : 'SAC'} · {loan.rate.value.replace('.', ',')}% {loan.rate.unit === 'monthly' ? 'a.m.' : `a.a. (${monthlyRatePercent(loan.rate).replace('.', ',')}% a.m.)`}
            </div>
          </div>
        </div>

        {/* Where it stands */}
        <section className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', p: '5' })}>
          <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
            <span className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Saldo devedor</span>
            <span className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>{summary.paidInstallments} de {summary.paidInstallments + summary.remainingInstallments} parcelas pagas</span>
          </div>
          <div className={cx(css({ mt: '1', fontFamily: 'serif', fontSize: '36', lineHeight: 'none', color: 'ink' }), nums)}>{settled ? 'Quitado' : formatBRL(summary.outstanding)}</div>
          <div className={css({ mt: '3', h: '1.5', rounded: 'full', bg: 'border', overflow: 'hidden' })}>
            <div className={cx(css({ h: 'full', rounded: 'full', bg: 'ink' }), barGrow)} style={{ width: `${progress}%` }} />
          </div>
          <div className={cx(css({ mt: '1.5', fontSize: '12', color: 'muted' }), nums)}>{progress}% de {formatBRL(loan.principal)} amortizado</div>

          <div className={cx(css({ mt: '4', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', lg: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }, gap: '3' }), nums)}>
            <Fig label="Próxima" value={summary.next ? formatBRL(summary.next.total) : '—'} sub={summary.next ? `${summary.next.status === 'overdue' ? 'venceu' : 'vence'} ${formatDayMonthNumeric(summary.next.dueDate)}` : ''} danger={summary.next?.status === 'overdue'} />
            <Fig label="Termina em" value={summary.endDate ? formatMonthShortYear(summary.endDate) : '—'} sub={`${summary.remainingInstallments} restantes`} />
            <Fig label="Juros pagos" value={formatBRL(summary.interestPaid)} />
            <Fig label="Juros a pagar" value={formatBRL(summary.interestRemaining)} />
          </div>
          {summary.saved && summary.saved.interest > 0 && (
            <p className={css({ m: '0', mt: '3', fontSize: '13', color: 'ink' })}>
              As antecipações já economizaram <span className={cx(css({ fontWeight: 'bold' }), nums)}>{formatBRL(summary.saved.interest)}</span> em juros
              {summary.saved.months > 0 && <> e <span className={cx(css({ fontWeight: 'bold' }), nums)}>{summary.saved.months}</span> {summary.saved.months === 1 ? 'mês' : 'meses'}</>}.
            </p>
          )}

          {!settled && (
            <div className={css({ mt: '5', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2' })}>
              <button onClick={() => setPanel(panel === 'pay' ? null : 'pay')} className={css({ h: '12', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '14', fontWeight: 'bold', _hover: { opacity: '0.9' } })}>
                Pagar parcela {summary.next?.n}
              </button>
              <button onClick={() => setPanel(panel === 'prepay' ? null : 'prepay')} className={css({ h: '12', rounded: 'xl', borderWidth: '1px', borderColor: 'border', fontSize: '14', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' } })}>
                Antecipar / quitar
              </button>
            </div>
          )}
          {panel === 'pay' && summary.next && <PayPanel data={data} next={summary.next} onDone={() => setPanel(null)} />}
          {panel === 'prepay' && <PrepayPanel data={data} onDone={() => setPanel(null)} />}
          {panel === 'adjust' && <AdjustPanel data={data} onDone={() => setPanel(null)} />}

          <div className={css({ mt: '4', pt: '3', borderTopWidth: '1px', borderColor: 'border', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '4', rowGap: '2', fontSize: '13' })}>
            {!settled && panel !== 'adjust' && (
              <button onClick={() => setPanel('adjust')} className={css({ fontWeight: 'semibold', color: 'ink', _hover: { opacity: '0.7' } })}>Ajustar saldo pelo extrato</button>
            )}
            {last.kind !== 'release' && (
              confirm === 'undo' ? (
                <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '2' })}>
                  <span className={css({ color: 'muted' })}>Desfazer {describe(last)}?</span>
                  <button onClick={() => setConfirm(null)} className={css({ fontWeight: 'semibold', color: 'muted' })}>Não</button>
                  <button onClick={() => void run(() => undoLastLoanEvent(loanId))} className={css({ fontWeight: 'semibold', color: 'ink' })}>Desfazer</button>
                </span>
              ) : (
                <button onClick={() => setConfirm('undo')} className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' } })}>
                  <Undo2 size={14} strokeWidth={2} /> Desfazer último
                </button>
              )
            )}
            {events.length === 1 && (
              confirm === 'delete' ? (
                <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '2' })}>
                  <span className={css({ color: 'muted' })}>Excluir o empréstimo?</span>
                  <button onClick={() => setConfirm(null)} className={css({ fontWeight: 'semibold', color: 'muted' })}>Não</button>
                  <button onClick={() => void run(() => deleteLoan(loanId), onBack)} className={css({ fontWeight: 'semibold', color: 'ink' })}>Excluir</button>
                </span>
              ) : (
                <button onClick={() => setConfirm('delete')} className={css({ display: 'inline-flex', alignItems: 'center', gap: '1', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' } })}>
                  <Trash2 size={14} strokeWidth={2} /> Excluir
                </button>
              )
            )}
          </div>
          {error && <p className={css({ m: '0', mt: '2', fontSize: '13', color: 'expense' })} role="alert">{error}</p>}
        </section>

        <ScheduleTable data={data} />
      </div>
    </div>
  )
}

const describe = (e: LoanSchedule['last']) =>
  e.kind === 'payment' ? `o pagamento da parcela ${e.installment}` : e.kind === 'prepayment' ? 'a antecipação' : 'o ajuste de saldo'

function Fig({ label, value, sub, danger = false }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className={css({ minW: '0' })}>
      <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted' })}>{label}</div>
      <div className={css({ fontSize: '15', fontWeight: 'bold', color: 'ink', truncate: true })}>{value}</div>
      {sub && <div className={css({ fontSize: '12', truncate: true }, danger ? { color: 'expense', fontWeight: 'semibold' } : { color: 'muted' })}>{sub}</div>}
    </div>
  )
}

function useCashAccounts() {
  const accounts = useAccounts()
  return accounts?.filter(a => !a.archived && isCashAccount(a)) ?? []
}

function PayPanel({ data, next, onDone }: { data: LoanSchedule; next: ScheduleRow; onDone: () => void }) {
  const cash = useCashAccounts()
  const today = todayISO()
  const [from, setFrom] = useState<number | null>(data.loan.payFromAccountId)
  const [method, setMethod] = useState<PaymentMethod>(data.loan.method)
  const [date, setDate] = useState(today < next.dueDate ? today : next.dueDate)
  const [error, setError] = useState<string | null>(null)
  const fromId = cash.some(a => a.id === from) ? from : (cash[0]?.id ?? null)

  async function pay() {
    setError(null)
    try {
      await payLoanInstallment({ loanId: data.loan.id!, date, fromAccountId: fromId ?? undefined, method })
      onDone()
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível pagar.')
    }
  }

  return (
    <div className={cx(css({ mt: '4', mx: '-5', pt: '4', borderTopWidth: '1px', borderColor: 'border' }), slideUp)}>
      <div className={cx(css({ px: '5', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '2' }), nums)}>
        <Fig label="Amortização" value={formatBRL(next.principal)} />
        <Fig label="Juros" value={formatBRL(next.interest)} />
        <Fig label="Total" value={formatBRL(next.total)} sub={next.fees ? `inclui ${formatBRL(next.fees)} de encargos` : undefined} />
      </div>
      <div className={css({ px: '5', mt: '4' })}><FieldLabel>Pagar com</FieldLabel></div>
      <AccountChips label="Conta de pagamento" accounts={cash} value={fromId} onChange={setFrom} />
      <div className={css({ px: '5', mt: '2', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' })}>
        <Choice label="Forma de pagamento" value={method} onChange={setMethod} options={ACCOUNT_METHODS.map(m => ({ id: m, label: PAYMENT_METHODS[m] }))} />
      </div>
      <div className={css({ px: '5', mt: '3', display: 'flex', alignItems: 'center', gap: '2' })}>
        <input type="date" aria-label="Data do pagamento" value={date} onChange={e => setDate(e.target.value)} className={cx(css({ flex: '1', h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none' }), nums)} />
        <button onClick={() => void pay()} disabled={fromId === null} className={css({ h: '11', px: '5', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '14', fontWeight: 'bold', _disabled: { opacity: '0.4' } })}>
          Pagar {formatBRL(next.total)}
        </button>
      </div>
      <p className={css({ px: '5', mt: '2', mb: '0', fontSize: '12', color: 'muted' })}>Entra como despesa: amortização em uma categoria, juros em outra.</p>
      {error && <p className={css({ px: '5', mt: '2', mb: '0', fontSize: '13', color: 'expense' })} role="alert">{error}</p>}
    </div>
  )
}

/** Extra amortization with both outcomes side by side before confirming */
function PrepayPanel({ data, onDone }: { data: LoanSchedule; onDone: () => void }) {
  const cash = useCashAccounts()
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(todayISO())
  const [mode, setMode] = useState<PrepaymentMode>('reduce-term')
  const [from, setFrom] = useState<number | null>(data.loan.payFromAccountId)
  const [error, setError] = useState<string | null>(null)
  const fromId = cash.some(a => a.id === from) ? from : (cash[0]?.id ?? null)
  const { terms, last, summary } = data
  const nextDue = summary.next?.dueDate
  const blockedByDue = !!nextDue && date >= nextDue
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= last.date && !blockedByDue
  const payoff = validDate ? payoffAmount(terms, last.state, date) : null

  const compare = useMemo(() => {
    if (!amount || !validDate) return null
    type Outcome =
      | { ok: true; interestSaved: number; remaining: number; newPayment: number; end?: string; payoff: boolean }
      | { ok: false; error: string }
    const run = (m: PrepaymentMode): Outcome => {
      try {
        const r = prepayment(terms, last.state, date, amount, m)
        const rest = project(terms, r.state)
        return {
          ok: true,
          interestSaved: summary.interestRemaining - r.interest - rest.reduce((s, x) => s + x.interest, 0),
          remaining: rest.length,
          newPayment: rest[0]?.total ?? 0,
          end: rest[rest.length - 1]?.dueDate,
          payoff: r.payoff,
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Valor inválido' }
      }
    }
    return { term: run('reduce-term'), payment: run('reduce-payment') }
  }, [amount, date, validDate, terms, last, summary.interestRemaining])

  async function confirm() {
    if (!amount) return
    setError(null)
    try {
      await prepayLoan({ loanId: data.loan.id!, date, amount, mode, fromAccountId: fromId ?? undefined })
      onDone()
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível antecipar.')
    }
  }

  const term = compare?.term.ok ? compare.term : null
  const pay = compare?.payment.ok ? compare.payment : null
  const isPayoff = !!term?.payoff
  const err = compare && !compare.term.ok ? compare.term.error : null

  return (
    <div className={cx(css({ mt: '4', mx: '-5', px: '5', pt: '4', borderTopWidth: '1px', borderColor: 'border' }), slideUp)}>
      <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3' })}>
        <div>
          <FieldLabel>Valor</FieldLabel>
          <MoneyInput label="Valor da antecipação" value={amount} onChange={setAmount} />
        </div>
        <label className={css({ display: 'block' })}>
          <FieldLabel>Data</FieldLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={cx(css({ w: 'full', h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none' }), nums)} />
        </label>
      </div>
      {payoff !== null && (
        <button onClick={() => setAmount(payoff)} className={css({ mt: '2', fontSize: '12', fontWeight: 'semibold', color: 'ink', textDecoration: 'underline', textUnderlineOffset: '2px' })}>
          Quitar tudo: {formatBRL(payoff)} (saldo + juros até {formatDayMonthNumeric(date)})
        </button>
      )}

      {blockedByDue && summary.next && (
        <p className={css({ m: '0', mt: '3', fontSize: '13', color: 'expense' })}>
          A parcela {summary.next.n} vence{date > nextDue! ? 'u' : ''} em {formatDayMonthNumeric(nextDue!)} — pague-a primeiro, depois antecipe.
        </p>
      )}
      {err && <p className={css({ m: '0', mt: '3', fontSize: '13', color: 'expense' })}>{err.startsWith('O valor passa') ? 'O valor passa do saldo para quitação.' : err}</p>}

      {term && pay && !isPayoff && (
        <div className={css({ mt: '4', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2' })} role="radiogroup" aria-label="O que reduzir">
          <ModeCard
            active={mode === 'reduce-term'} onClick={() => setMode('reduce-term')} title="Reduzir prazo"
            saved={term.interestSaved}
            lines={[`${summary.remainingInstallments - term.remaining} parcelas a menos`, term.end ? `termina ${formatMonthShortYear(term.end)}` : '']}
          />
          <ModeCard
            active={mode === 'reduce-payment'} onClick={() => setMode('reduce-payment')} title="Reduzir parcela"
            saved={pay.interestSaved}
            lines={[`parcela de ${formatBRL(pay.newPayment)}`, `mesmo prazo (${pay.remaining})`]}
          />
        </div>
      )}
      {isPayoff && <p className={css({ m: '0', mt: '3', fontSize: '13', color: 'ink' })}>Este valor quita o empréstimo.</p>}

      <div className={css({ mt: '4' })}><FieldLabel>Pagar com</FieldLabel></div>
      <div className={css({ mx: '-5' })}><AccountChips label="Conta de pagamento" accounts={cash} value={fromId} onChange={setFrom} /></div>
      <button
        onClick={() => void confirm()}
        disabled={!amount || !!err || fromId === null || blockedByDue}
        className={css({ mt: '3', w: 'full', h: '11', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '14', fontWeight: 'bold', _disabled: { opacity: '0.4' } })}
      >
        {isPayoff ? `Quitar com ${formatBRL(amount!)}` : amount ? `Antecipar ${formatBRL(amount)}` : 'Antecipar'}
      </button>
      <p className={css({ mt: '2', mb: '0', fontSize: '12', color: 'muted' })}>Os juros do período até a data são pagos primeiro (pró-rata por dia); o resto abate o saldo.</p>
      {error && <p className={css({ mt: '2', mb: '0', fontSize: '13', color: 'expense' })} role="alert">{error}</p>}
    </div>
  )
}

function ModeCard({ active, onClick, title, saved, lines }: { active: boolean; onClick: () => void; title: string; saved: number; lines: string[] }) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={css({ textAlign: 'left', rounded: 'xl', borderWidth: '1px', p: '3', transition: 'colors' }, active ? { borderColor: 'ink', bg: 'bg' } : { borderColor: 'border', _hover: { borderColor: 'muted/40' } })}
    >
      <div className={css({ fontSize: '13', fontWeight: 'semibold', color: 'ink' })}>{title}</div>
      <div className={css({ mt: '1', fontSize: '12', color: 'muted' })}>economia de juros</div>
      <div className={cx(css({ fontSize: '16', fontWeight: 'bold', color: 'ink' }), nums)}>{formatBRL(Math.max(0, saved))}</div>
      {lines.filter(Boolean).map(l => <div key={l} className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>{l}</div>)}
    </button>
  )
}

function AdjustPanel({ data, onDone }: { data: LoanSchedule; onDone: () => void }) {
  const [balance, setBalance] = useState<number | null>(data.summary.outstanding)
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  async function save() {
    if (balance === null) return
    setError(null)
    try {
      await adjustLoanBalance({ loanId: data.loan.id!, date, balance })
      onDone()
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível ajustar.')
    }
  }
  return (
    <div className={cx(css({ mt: '4', mx: '-5', px: '5', pt: '4', borderTopWidth: '1px', borderColor: 'border' }), slideUp)}>
      <FieldLabel>Saldo devedor no extrato do banco</FieldLabel>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
        <MoneyInput label="Saldo devedor" value={balance} onChange={setBalance} className={css({ flex: '1' })} />
        <input type="date" aria-label="Data do extrato" value={date} onChange={e => setDate(e.target.value)} className={cx(css({ w: '[150px]', h: '11', px: '2.5', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none' }), nums)} />
      </div>
      <p className={css({ mt: '1.5', mb: '0', fontSize: '12', color: 'muted' })}>Use quando o banco mostrar um saldo diferente (seguros, arredondamentos). Nenhum dinheiro se move; as parcelas futuras são recalculadas.</p>
      <div className={css({ mt: '3', display: 'flex', gap: '2' })}>
        <button onClick={onDone} className={css({ flex: '1', h: '11', rounded: 'xl', borderWidth: '1px', borderColor: 'border', fontSize: '14', fontWeight: 'semibold', color: 'ink' })}>Cancelar</button>
        <button onClick={() => void save()} className={css({ flex: '1', h: '11', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '14', fontWeight: 'bold' })}>Ajustar</button>
      </div>
      {error && <p className={css({ mt: '2', mb: '0', fontSize: '13', color: 'expense' })} role="alert">{error}</p>}
    </div>
  )
}

const STATUS_LABEL: Record<ScheduleRow['status'], string> = { paid: 'Paga', due: 'Próxima', overdue: 'Vencida', projected: '' }

/** 360 rows stay readable: one collapsible group per year, the current year open */
function ScheduleTable({ data }: { data: LoanSchedule }) {
  const thisYear = todayISO().slice(0, 4)
  const years = new Map<string, ScheduleRow[]>()
  for (const r of data.installments) {
    const y = r.dueDate.slice(0, 4)
    years.set(y, [...(years.get(y) ?? []), r])
  }
  const extras = data.events.filter(e => e.kind === 'prepayment' || e.kind === 'adjust')
  const openYear = years.has(thisYear) ? thisYear : [...years.keys()][0]

  return (
    <section className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', overflow: 'hidden' })}>
      <div className={css({ px: '5', pt: '5', pb: '2', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Quadro de amortização</div>
      {[...years.entries()].map(([year, rows]) => {
        const paid = rows.filter(r => r.status === 'paid').length
        const yearExtras = extras.filter(e => e.date.startsWith(year))
        return (
          <details key={year} open={year === openYear} className={cx(css({ borderTopWidth: '1px', borderColor: 'border' }), 'group')}>
            <summary className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '5', py: '3', cursor: 'pointer', userSelect: 'none' })}>
              <span className={cx(css({ fontSize: '15', fontWeight: 'semibold', color: 'ink' }), nums)}>{year}</span>
              <span className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>{rows.length} parcelas{paid ? ` · ${paid} pagas` : ''}</span>
              <span className={cx(css({ ml: 'auto', fontSize: '13', fontWeight: 'semibold', color: 'ink' }), nums)}>{formatBRL(rows.reduce((s, r) => s + r.total, 0))}</span>
            </summary>
            <div className={css({ overflowX: 'auto' })}>
              <table className={cx(css({ w: 'full', fontSize: '13', borderCollapse: 'collapse' }), nums)}>
                <thead>
                  <tr className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.06em]', color: 'muted' })}>
                    <th scope="col" className={css({ textAlign: 'left', fontWeight: 'semibold', pl: '5', pr: '1.5', py: '2' })}>Nº</th>
                    <th scope="col" className={css({ textAlign: 'left', fontWeight: 'semibold', px: '1.5', py: '2' })}>Venc.</th>
                    <th scope="col" className={css({ textAlign: 'right', fontWeight: 'semibold', px: '1.5', py: '2' })}>Prestação</th>
                    <th scope="col" className={css({ display: 'none', lg: { display: 'table-cell' }, textAlign: 'right', fontWeight: 'semibold', px: '1.5', py: '2' })}>Juros</th>
                    <th scope="col" className={css({ display: 'none', lg: { display: 'table-cell' }, textAlign: 'right', fontWeight: 'semibold', px: '1.5', py: '2' })}>Amortização</th>
                    <th scope="col" className={css({ textAlign: 'right', fontWeight: 'semibold', pl: '1.5', pr: '5', py: '2' })}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, k) => (
                    <Fragment key={r.n}>
                      {/* Prepayments / adjustments sit between the installments around their date */}
                      {yearExtras
                        .filter(e => e.date < r.dueDate && (k === 0 || e.date >= rows[k - 1].dueDate))
                        .map(e => <ExtraRow key={`e${e.id}`} e={e} />)}
                    <tr className={css({ borderTopWidth: '1px', borderColor: 'border' }, r.status === 'paid' ? { color: 'muted' } : { color: 'ink' })}>
                      <td className={css({ pl: '5', pr: '1.5', py: '2' })}>
                        {r.n}
                        {r.status !== 'projected' && (
                          <span className={css({ ml: '1.5', fontSize: '10', fontWeight: 'semibold', textTransform: 'uppercase' }, r.status === 'overdue' ? { color: 'expense' } : r.status === 'paid' ? { color: 'muted' } : { color: 'ink' })}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        )}
                      </td>
                      <td className={css({ px: '1.5', py: '2', whiteSpace: 'nowrap' })}>{formatDayMonthNumeric(r.dueDate)}</td>
                      <td className={css({ textAlign: 'right', fontWeight: 'semibold', px: '1.5', py: '2', whiteSpace: 'nowrap' })}>{formatBRL(r.total)}</td>
                      <td className={css({ display: 'none', lg: { display: 'table-cell' }, textAlign: 'right', px: '1.5', py: '2', whiteSpace: 'nowrap' })}>{formatBRL(r.interest)}</td>
                      <td className={css({ display: 'none', lg: { display: 'table-cell' }, textAlign: 'right', px: '1.5', py: '2', whiteSpace: 'nowrap' })}>{formatBRL(r.principal)}</td>
                      <td className={css({ textAlign: 'right', pl: '1.5', pr: '5', py: '2', whiteSpace: 'nowrap' })}>{formatBRL(r.balanceAfter)}</td>
                    </tr>
                    </Fragment>
                  ))}
                  {yearExtras.filter(e => e.date >= rows[rows.length - 1].dueDate).map(e => <ExtraRow key={`e${e.id}`} e={e} />)}
                </tbody>
              </table>
            </div>
          </details>
        )
      })}
    </section>
  )
}

function ExtraRow({ e }: { e: LoanSchedule['events'][number] }) {
  return (
    <tr className={css({ borderTopWidth: '1px', borderColor: 'border', bg: 'bg/60' })}>
      <td colSpan={6} className={css({ pl: '5', pr: '5', py: '2', fontSize: '12', color: 'ink' })}>
        {e.kind === 'prepayment'
          ? <>⤓ Antecipação de <b>{formatBRL(e.amount)}</b> em {formatDate(e.date)} — {formatBRL(e.principal)} abatido, {e.mode === 'reduce-term' ? 'prazo reduzido' : 'parcela reduzida'}</>
          : <>≈ Saldo ajustado pelo extrato para <b>{formatBRL(e.amount)}</b> em {formatDate(e.date)}</>}
      </td>
    </tr>
  )
}
