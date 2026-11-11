import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { db, formatBRL, sortCategories, todayISO, type LoanType, type PaymentMethod } from '../../core/db'
import { ACCOUNT_METHODS, LedgerError, PAYMENT_METHODS, isCashAccount } from '../../core/ledger/base'
import { LOAN_TYPES, createLoan } from './ledger'
import { monthlyRatePercent, originalSchedule, type AmortizationSystem, type RateUnit } from './loanMath'
import { addMonths, dayIn, parseYM } from '../credit-cards'
import { useAccounts, AccountChips } from '../accounts'
import { Choice, FieldLabel, MoneyInput } from '../../shared/ui/MoneyInput'

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthYear = (iso: string) => `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`
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

  const input = 'h-11 px-3 rounded-[10px] border border-border bg-bg text-[15px] text-ink placeholder:text-muted outline-none focus:border-muted/60'

  return (
    <div className="flex-1 overflow-y-auto pb-28 md:pb-12">
      <div className="md:max-w-[560px] md:mx-auto md:px-10 md:pt-8">
        <div className="flex items-center gap-2 px-3 md:px-0 h-14 md:h-auto md:mb-5">
          <button onClick={onCancel} aria-label="Voltar" className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-border/60">
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <h1 className="m-0 text-[17px] md:text-[22px] font-semibold tracking-[-.01em] text-ink">Novo empréstimo ou financiamento</h1>
        </div>

        <div className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl p-5 flex flex-col gap-5">
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Ex.: Financiamento do carro" className={`w-full ${input}`} aria-label="Nome" />
          </div>
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <Choice label="Tipo" value={type} onChange={setType} options={(Object.keys(LOAN_TYPES) as LoanType[]).map(id => ({ id, label: LOAN_TYPES[id].label }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Valor financiado</FieldLabel>
              <MoneyInput label="Valor financiado" value={principal} onChange={setPrincipal} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Prazo</FieldLabel>
              <div className="h-11 px-3 rounded-[10px] border border-border bg-bg flex items-center gap-1.5 focus-within:border-muted/60">
                <input inputMode="numeric" aria-label="Prazo em meses" placeholder="48" value={term} onChange={e => setTerm(e.target.value.replace(/\D/g, '').slice(0, 3))} className="flex-1 min-w-0 bg-transparent text-[15px] font-semibold nums text-ink placeholder:text-muted placeholder:font-normal outline-none" />
                <span className="text-[13px] text-muted">meses</span>
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Taxa de juros</FieldLabel>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-11 px-3 rounded-[10px] border border-border bg-bg flex items-center gap-1.5 focus-within:border-muted/60">
                <input inputMode="decimal" aria-label="Taxa de juros" placeholder="1,49" value={rateText} onChange={e => setRateText(e.target.value.replace(/[^\d,.]/g, '').slice(0, 10))} className="flex-1 min-w-0 bg-transparent text-[15px] font-semibold nums text-ink placeholder:text-muted placeholder:font-normal outline-none" />
                <span className="text-[13px] text-muted">%</span>
              </div>
              <Choice label="Período da taxa" value={rateUnit} onChange={setRateUnit} options={[{ id: 'monthly', label: 'ao mês' }, { id: 'annual', label: 'ao ano' }]} />
            </div>
            {sim && rateUnit === 'annual' && <p className="m-0 mt-1.5 text-[12px] text-muted nums">Equivale a {sim.monthly.replace('.', ',')}% ao mês (juros compostos).</p>}
          </div>

          <div>
            <FieldLabel>Sistema de amortização</FieldLabel>
            <Choice label="Sistema" value={system} onChange={setSystem} options={[{ id: 'price', label: 'Price — parcelas iguais' }, { id: 'sac', label: 'SAC — parcelas decrescentes' }]} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <FieldLabel>Contratado em</FieldLabel>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setFirstDue(null) }} className={`w-full nums ${input}`} />
            </label>
            <label className="block min-w-0">
              <FieldLabel>1º vencimento</FieldLabel>
              <input type="date" value={firstDueDate} onChange={e => setFirstDue(e.target.value)} className={`w-full nums ${input}`} />
            </label>
          </div>

          <div>
            <FieldLabel>Como o dinheiro foi liberado</FieldLabel>
            <Choice label="Liberação" value={release} onChange={setRelease} options={[{ id: 'direct', label: 'Pago direto ao vendedor' }, { id: 'deposit', label: 'Caiu na minha conta' }]} />
            {release === 'deposit' && (
              <div className="-mx-5 mt-3">
                <AccountChips label="Conta que recebeu" accounts={cash} value={releaseId} onChange={setReleaseAccount} />
              </div>
            )}
            <p className="m-0 mt-1.5 text-[12px] text-muted">
              {release === 'deposit' ? 'O valor entra na conta como transferência — não conta como receita.' : 'Imóvel ou veículo: nada entra na sua conta; só nasce a dívida.'}
            </p>
          </div>

          <div>
            <FieldLabel>Parcelas pagas com</FieldLabel>
            <div className="-mx-5"><AccountChips label="Conta de pagamento" accounts={cash} value={payFromId} onChange={setPayFrom} /></div>
            <div className="mt-2">
              <Choice label="Forma de pagamento" value={method} onChange={setMethod} options={ACCOUNT_METHODS.map(m => ({ id: m, label: PAYMENT_METHODS[m] }))} />
            </div>
          </div>

          <div>
            <FieldLabel>Categorias da parcela</FieldLabel>
            <p className="m-0 mb-2 text-[12px] text-muted">A prestação inteira conta como despesa: a amortização numa categoria, os juros em outra.</p>
            <div className="grid grid-cols-2 gap-3">
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
        <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl p-5" aria-live="polite">
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2">Simulação</div>
          {sim ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 nums">
              <Fig label={system === 'price' ? 'Parcela' : '1ª parcela'} value={formatBRL(sim.first.total)} strong />
              <Fig label={system === 'price' ? 'Última' : 'Última parcela'} value={formatBRL(sim.last.total)} />
              <Fig label="Total de juros" value={formatBRL(sim.interest)} />
              <Fig label="Total pago" value={formatBRL(sim.total)} />
              <Fig label="1ª parcela: juros" value={formatBRL(sim.first.interest)} />
              <Fig label="Termina em" value={monthYear(sim.last.dueDate)} />
            </div>
          ) : (
            <p className="m-0 text-[13px] text-muted">Preencha valor, taxa e prazo para ver as parcelas.</p>
          )}
        </section>

        <div className="mx-5 md:mx-0 mt-4">
          {error && <p className="m-0 mb-3 text-[13px] text-expense text-center" role="alert">{error}</p>}
          <button
            onClick={() => void submit()}
            disabled={busy || !sim || !name.trim()}
            className="w-full h-12 rounded-xl bg-ink text-bg text-[15px] font-bold disabled:opacity-40 hover:opacity-90"
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
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">{label}</div>
      <div className={`truncate ${strong ? 'text-[17px] font-bold' : 'text-[15px] font-semibold'} text-ink`}>{value}</div>
    </div>
  )
}

function CategorySelect({ label, value, onChange, options }: {
  label: string; value: number | null; onChange: (id: number) => void; options: { id?: number; name: string; icon: string }[]
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[12px] text-muted mb-1">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-11 px-2.5 rounded-[10px] border border-border bg-bg text-[14px] text-ink outline-none focus:border-muted/60"
      >
        {options.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
      </select>
    </label>
  )
}
