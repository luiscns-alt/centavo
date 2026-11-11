import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { db, sortCategories } from '../../core/db'
import { LedgerError, isCashAccount } from '../../core/ledger/base'
import { createLoan } from './ledger'
import { monthlyRatePercent, originalSchedule } from './loanMath'
import { useAccounts, AccountChips } from '../accounts'
import { Choice, FieldLabel, MoneyInput } from '../../shared/ui/MoneyInput'
import { ACCOUNT_METHODS, PAYMENT_METHODS, LOAN_TYPES } from '../../core/constants/domain'
import type { LoanType, PaymentMethod, AmortizationSystem, RateUnit } from '../../core/types'
import { todayISO, addMonths, dayIn, parseYM, formatMonthShortYear } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'
import { css, cx } from '../../../styled-system/css'
import { nums } from '../../shared/ui/atoms'

const plusOneMonth = (iso: string) => dayIn(addMonths(parseYM(iso), 1), Number(iso.slice(8)))

interface Props {
  onCreated: (loanId: number) => void
  onCancel: () => void
}

/** Register a loan or financing, with the schedule simulated live as the contract is typed */
export function LoanForm({ onCreated, onCancel }: Props) {
  const accounts = useAccounts()
  const cash = accounts?.filter(a => !a.archived && isCashAccount(a)) ?? []
  const categories = useLiveQuery(async () => sortCategories(await db.categories.where('type').equals('expense').toArray()))

  const [name, setName] = useState('')
  const [type, setType] = useState<LoanType>('vehicle')
  const [principal, setPrincipal] = useState<number | null>(null)
  const [rateText, setRateText] = useState('')
  const [rateUnit, setRateUnit] = useState<RateUnit>('monthly')
  const [term, setTerm] = useState('')
  const [system, setSystem] = useState<AmortizationSystem>('price')
  const [startDate, setStartDate] = useState(todayISO())
  const [firstDue, setFirstDue] = useState<string | null>(null)
  const [release, setRelease] = useState<'deposit' | 'direct'>('direct')
  const [releaseAccount, setReleaseAccount] = useState<number | null>(null)
  const [payFrom, setPayFrom] = useState<number | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('boleto')
  const [principalCat, setPrincipalCat] = useState<number | null>(null)
  const [interestCat, setInterestCat] = useState<number | null>(null)
  const [fees, setFees] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const firstDueDate = firstDue ?? plusOneMonth(startDate)
  const payFromId = payFrom ?? cash[0]?.id ?? null
  const releaseId = releaseAccount ?? payFromId
  const byName = (n: string) => categories?.find(c => c.name === n)?.id ?? null
  const principalCatId = principalCat ?? byName('Financiamentos') ?? categories?.[0]?.id ?? null
  const interestCatId = interestCat ?? byName('Juros e encargos') ?? principalCatId
  const termMonths = Number(term)

  const rate = { value: rateText.replace(',', '.'), unit: rateUnit }
  const validRate = /^\d+(\.\d+)?$/.test(rate.value)

  // Live simulation — the same engine the ledger will use
  const sim = useMemo(() => {
    if (!principal || !validRate || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 600) return null
    try {
      const s = originalSchedule({ principal, rate, termMonths, system, startDate, firstDueDate, monthlyFees: fees ?? 0 })
      return {
        first: s[0], last: s[s.length - 1],
        interest: s.reduce((t, r) => t + r.interest, 0),
        total: s.reduce((t, r) => t + r.total, 0),
        monthly: monthlyRatePercent(rate),
      }
    } catch { return null }
  }, [principal, validRate, rate.value, rate.unit, termMonths, system, startDate, firstDueDate, fees]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Dê um nome ao empréstimo.')
    if (!principal) return setError('Informe o valor.')
    if (!validRate) return setError('Informe a taxa de juros, ex.: 1,49.')
    if (payFromId === null || principalCatId === null || interestCatId === null) return setError('Cadastre uma conta antes.')
    setBusy(true)
    try {
      const { loanId } = await createLoan({
        name, type, principal, rate, termMonths, system, startDate, firstDueDate,
        monthlyFees: fees ?? undefined, release, releaseAccountId: release === 'deposit' ? releaseId ?? undefined : undefined,
        payFromAccountId: payFromId, principalCategoryId: principalCatId, interestCategoryId: interestCatId, method,
        bankId: cash.find(a => a.id === payFromId)?.bankId ?? null,
      })
      onCreated(loanId)
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css({ flex: '1', overflowY: 'auto', pb: '28', md: { pb: '12' } })}>
      <div className={css({ md: { maxW: '[560px]', mx: 'auto', px: '10', pt: '8' } })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2', px: '3', md: { px: '0', h: 'auto', mb: '5' }, h: '14' })}>
          <button onClick={onCancel} aria-label="Voltar" className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'border/60' } })}>
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <h1 className={css({ m: '0', fontSize: '17', md: { fontSize: '22' }, fontWeight: 'semibold', letterSpacing: 'title', color: 'ink' })}>Novo empréstimo ou financiamento</h1>
        </div>

        <div className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', p: '5', display: 'flex', flexDirection: 'column', gap: '5' })}>
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Ex.: Financiamento do carro" className={css({ w: 'full' }, { h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '15', color: 'ink', _placeholder: { color: 'muted' }, outline: 'none', _focus: { borderColor: 'muted/60' } })} aria-label="Nome" />
          </div>
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <Choice label="Tipo" value={type} onChange={setType} options={(Object.keys(LOAN_TYPES) as LoanType[]).map(id => ({ id, label: LOAN_TYPES[id].label }))} />
          </div>

          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3' })}>
            <div className={css({ gridColumn: 'span 2 / span 2', sm: { gridColumn: 'span 1 / span 1' } })}>
              <FieldLabel>Valor financiado</FieldLabel>
              <MoneyInput label="Valor financiado" value={principal} onChange={setPrincipal} />
            </div>
            <div className={css({ gridColumn: 'span 2 / span 2', sm: { gridColumn: 'span 1 / span 1' } })}>
              <FieldLabel>Prazo</FieldLabel>
              <div className={css({ h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', display: 'flex', alignItems: 'center', gap: '1.5', _focusWithin: { borderColor: 'muted/60' } })}>
                <input inputMode="numeric" aria-label="Prazo em meses" placeholder="48" value={term} onChange={e => setTerm(e.target.value.replace(/\D/g, '').slice(0, 3))} className={cx(css({ flex: '1', minW: '0', bg: 'transparent', fontSize: '15', fontWeight: 'semibold', color: 'ink', _placeholder: { color: 'muted', fontWeight: 'normal' }, outline: 'none' }), nums)} />
                <span className={css({ fontSize: '13', color: 'muted' })}>meses</span>
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Taxa de juros</FieldLabel>
            <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
              <div className={css({ flex: '1', h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', display: 'flex', alignItems: 'center', gap: '1.5', _focusWithin: { borderColor: 'muted/60' } })}>
                <input inputMode="decimal" aria-label="Taxa de juros" placeholder="1,49" value={rateText} onChange={e => setRateText(e.target.value.replace(/[^\d,.]/g, '').slice(0, 10))} className={cx(css({ flex: '1', minW: '0', bg: 'transparent', fontSize: '15', fontWeight: 'semibold', color: 'ink', _placeholder: { color: 'muted', fontWeight: 'normal' }, outline: 'none' }), nums)} />
                <span className={css({ fontSize: '13', color: 'muted' })}>%</span>
              </div>
              <Choice label="Período da taxa" value={rateUnit} onChange={setRateUnit} options={[{ id: 'monthly', label: 'ao mês' }, { id: 'annual', label: 'ao ano' }]} />
            </div>
            {sim && rateUnit === 'annual' && <p className={cx(css({ m: '0', mt: '1.5', fontSize: '12', color: 'muted' }), nums)}>Equivale a {sim.monthly.replace('.', ',')}% ao mês (juros compostos).</p>}
          </div>

          <div>
            <FieldLabel>Sistema de amortização</FieldLabel>
            <Choice label="Sistema" value={system} onChange={setSystem} options={[{ id: 'price', label: 'Price — parcelas iguais' }, { id: 'sac', label: 'SAC — parcelas decrescentes' }]} />
          </div>

          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3' })}>
            <label className={css({ display: 'block', minW: '0' })}>
              <FieldLabel>Contratado em</FieldLabel>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setFirstDue(null) }} className={cx(css({ w: 'full' }, { h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '15', color: 'ink', _placeholder: { color: 'muted' }, outline: 'none', _focus: { borderColor: 'muted/60' } }), nums)} />
            </label>
            <label className={css({ display: 'block', minW: '0' })}>
              <FieldLabel>1º vencimento</FieldLabel>
              <input type="date" value={firstDueDate} onChange={e => setFirstDue(e.target.value)} className={cx(css({ w: 'full' }, { h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '15', color: 'ink', _placeholder: { color: 'muted' }, outline: 'none', _focus: { borderColor: 'muted/60' } }), nums)} />
            </label>
          </div>

          <div>
            <FieldLabel>Como o dinheiro foi liberado</FieldLabel>
            <Choice label="Liberação" value={release} onChange={setRelease} options={[{ id: 'direct', label: 'Pago direto ao vendedor' }, { id: 'deposit', label: 'Caiu na minha conta' }]} />
            {release === 'deposit' && (
              <div className={css({ mx: '-5', mt: '3' })}>
                <AccountChips label="Conta que recebeu" accounts={cash} value={releaseId} onChange={setReleaseAccount} />
              </div>
            )}
            <p className={css({ m: '0', mt: '1.5', fontSize: '12', color: 'muted' })}>
              {release === 'deposit' ? 'O valor entra na conta como transferência — não conta como receita.' : 'Imóvel ou veículo: nada entra na sua conta; só nasce a dívida.'}
            </p>
          </div>

          <div>
            <FieldLabel>Parcelas pagas com</FieldLabel>
            <div className={css({ mx: '-5' })}><AccountChips label="Conta de pagamento" accounts={cash} value={payFromId} onChange={setPayFrom} /></div>
            <div className={css({ mt: '2' })}>
              <Choice label="Forma de pagamento" value={method} onChange={setMethod} options={ACCOUNT_METHODS.map(m => ({ id: m, label: PAYMENT_METHODS[m] }))} />
            </div>
          </div>

          <div>
            <FieldLabel>Categorias da parcela</FieldLabel>
            <p className={css({ m: '0', mb: '2', fontSize: '12', color: 'muted' })}>A prestação inteira conta como despesa: a amortização numa categoria, os juros em outra.</p>
            <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3' })}>
              <CategorySelect label="Amortização" value={principalCatId} onChange={setPrincipalCat} options={categories ?? []} />
              <CategorySelect label="Juros" value={interestCatId} onChange={setInterestCat} options={categories ?? []} />
            </div>
          </div>

          <div>
            <FieldLabel>Seguro / taxa mensal fixa (opcional)</FieldLabel>
            <MoneyInput label="Encargo mensal" value={fees} onChange={setFees} placeholder="0,00" />
          </div>
        </div>

        {/* Live simulation */}
        <section className={css({ mx: '5', md: { mx: '0' }, mt: '4', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', p: '5' })} aria-live="polite">
          <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '2' })}>Simulação</div>
          {sim ? (
            <div className={cx(css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: '4', rowGap: '3' }), nums)}>
              <Fig label={system === 'price' ? 'Parcela' : '1ª parcela'} value={formatBRL(sim.first.total)} strong />
              <Fig label={system === 'price' ? 'Última' : 'Última parcela'} value={formatBRL(sim.last.total)} />
              <Fig label="Total de juros" value={formatBRL(sim.interest)} />
              <Fig label="Total pago" value={formatBRL(sim.total)} />
              <Fig label="1ª parcela: juros" value={formatBRL(sim.first.interest)} />
              <Fig label="Termina em" value={formatMonthShortYear(sim.last.dueDate)} />
            </div>
          ) : (
            <p className={css({ m: '0', fontSize: '13', color: 'muted' })}>Preencha valor, taxa e prazo para ver as parcelas.</p>
          )}
        </section>

        <div className={css({ mx: '5', md: { mx: '0' }, mt: '4' })}>
          {error && <p className={css({ m: '0', mb: '3', fontSize: '13', color: 'expense', textAlign: 'center' })} role="alert">{error}</p>}
          <button
            onClick={() => void submit()}
            disabled={busy || !sim || !name.trim()}
            className={css({ w: 'full', h: '12', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '15', fontWeight: 'bold', _disabled: { opacity: '0.4' }, _hover: { opacity: '0.9' } })}
          >
            {busy ? 'Salvando...' : 'Cadastrar empréstimo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Fig({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={css({ minW: '0' })}>
      <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted' })}>{label}</div>
      <div className={css({ truncate: true }, strong ? { fontSize: '17', fontWeight: 'bold' } : { fontSize: '15', fontWeight: 'semibold' }, { color: 'ink' })}>{value}</div>
    </div>
  )
}

function CategorySelect({ label, value, onChange, options }: {
  label: string; value: number | null; onChange: (id: number) => void; options: { id?: number; name: string; icon: string }[]
}) {
  return (
    <label className={css({ display: 'block', minW: '0' })}>
      <span className={css({ display: 'block', fontSize: '12', color: 'muted', mb: '1' })}>{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        className={css({ w: 'full', h: '11', px: '2.5', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none', _focus: { borderColor: 'muted/60' } })}
      >
        {options.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
      </select>
    </label>
  )
}
