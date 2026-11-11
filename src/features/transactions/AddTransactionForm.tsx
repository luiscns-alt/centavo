import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, Check, ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { addCategory, db, sortCategories } from '../../core/db'
import { LedgerError, isCashAccount } from '../../core/ledger/base'
import { createAccount, type AccountInput, useAccountBalances, useAccounts, AccountChips, AccountEditor } from '../accounts'
import { createCardPurchase, deleteCardPurchase, updateCardPurchase, invoiceFor, splitInstallments, useCardSummaries } from '../credit-cards'
import { addTransaction, createTransfer, deleteTransaction, deleteTransfer, updateTransaction, updateTransfer } from './ledger'
import { requestPersistentStorageOnce } from '../../core/storage'
import { Button } from '../../shared/ui/Button'
import { chip } from '../../shared/ui/variants'
import { CategoryEditor } from '../categories'
import { RefundDetail, RefundPanel } from './RefundPanel'
import { ACCOUNT_METHODS, PAYMENT_METHODS } from '../../core/constants/domain'
import type { PaymentMethod } from '../../core/types'
import { todayISO, toISODate, formatMonthAbbr, formatMonthShortYear } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'
import { STORAGE_KEYS } from '../../shared/constants/storageKeys'
import { readLocal, writeLocal } from '../../shared/utils/storage'

type Mode = 'expense' | 'income' | 'transfer'

const MODES: { id: Mode; label: string }[] = [
  { id: 'expense',  label: 'Despesa' },
  { id: 'income',   label: 'Receita' },
  { id: 'transfer', label: 'Transferência' },
]

/** An existing entry to edit: a plain income/expense, a card purchase (all its installments), or a transfer */
export type EditTarget =
  ({ kind: 'tx'; id: number } | { kind: 'purchase'; id: number } | { kind: 'transfer'; id: number })
  & { returnToCard?: number }

interface Props {
  /** Account selected in the app's filter — preferred over the last used one */
  defaultAccountId?: number | null
  /** New entry opened from an Início shortcut */
  startMode?: Mode
  edit?: EditTarget
  onSaved?: () => void
  onCancel?: () => void
}

interface FormInitial {
  mode: Mode
  digits: string
  categoryId: number | ''
  accountId: number | null
  toId: number | null
  description: string
  date: string
  method: PaymentMethod | null
  installments: number
  /** Kept when editing an invoice payment */
  invoiceMonth?: string
  /** A refund is not edited, only shown and deleted */
  isRefund?: boolean
  /** Original amount (refund ceiling) */
  amountTotal: number
  loanRow?: boolean
  installmentRow?: boolean
}

const MAX_DIGITS = 11 // R$ 999.999.999,99
const MAX_UI_INSTALLMENTS = 24

/** Cash-register style: digits fill from the right — "1250" → "12,50" */
function formatDigits(digits: string): string {
  if (digits === '') return ''
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(digits) / 100)
}

function yesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toISODate(d)
}


const blank = (mode: Mode = 'expense'): FormInitial => ({
  mode, amountTotal: 0, digits: '', categoryId: '', accountId: null, toId: null,
  description: '', date: todayISO(), method: null, installments: 1,
})

/** Loads the entry being edited, then renders the form with it */
export function AddTransactionForm(props: Props) {
  const { edit } = props
  const initial = useLiveQuery(async (): Promise<FormInitial | null> => {
    if (!edit) return blank(props.startMode)
    if (edit.kind === 'tx') {
      const t = await db.transactions.get(edit.id)
      if (!t) return null
      return {
        mode: t.type === 'income' ? 'income' : 'expense', isRefund: t.type === 'refund', amountTotal: t.amount, loanRow: t.loanEventId !== undefined, installmentRow: t.purchaseId !== undefined, digits: String(t.amount), categoryId: t.categoryId, accountId: t.accountId, toId: null,
        description: t.description ?? '', date: t.date, method: t.method ?? null, installments: 1,
      }
    }
    if (edit.kind === 'purchase') {
      const p = await db.purchases.get(edit.id)
      if (!p) return null
      return {
        mode: 'expense', amountTotal: p.total, digits: String(p.total), categoryId: p.categoryId, accountId: p.accountId, toId: null,
        description: p.description ?? '', date: p.date, method: 'credit', installments: p.installments,
      }
    }
    const t = await db.transfers.get(edit.id)
    if (!t) return null
    return {
      mode: 'transfer', amountTotal: t.amount, digits: String(t.amount), categoryId: '', accountId: t.fromAccountId, toId: t.toAccountId,
      description: t.description ?? '', date: t.date, method: null, installments: 1, invoiceMonth: t.invoiceMonth,
    }
  }, [edit?.kind, edit?.id, props.startMode])

  if (initial === undefined) return <div className="flex-1" />
  if (initial === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[14px] text-muted m-0">Este lançamento não existe mais.</p>
        <button onClick={props.onCancel} className="h-9 px-4 rounded-full border border-border text-[13px] font-semibold text-ink">Voltar</button>
      </div>
    )
  }
  if (initial.isRefund && edit?.kind === 'tx') return <RefundDetail id={edit.id} onDone={() => props.onSaved?.()} onCancel={props.onCancel} />
  return <TransactionForm {...props} initial={initial} />
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="px-5 text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2.5">{children}</div>
)

function TransactionForm({ defaultAccountId = null, edit, onSaved, onCancel, initial }: Props & { initial: FormInitial }) {
  const isEdit = edit !== undefined
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [digits, setDigits] = useState(initial.digits)
  const [categoryId, setCategoryId] = useState<number | ''>(initial.categoryId)
  const [accountChoice, setAccountChoice] = useState<number | null>(initial.accountId)
  const [toChoice, setToChoice] = useState<number | null>(initial.toId)
  const [description, setDescription] = useState(initial.description)
  const [date, setDate] = useState(initial.date)
  const [methodChoice, setMethodChoice] = useState<PaymentMethod | null>(initial.method === 'credit' ? null : initial.method)
  const [installments, setInstallments] = useState(initial.installments)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState<null | 'from' | 'to'>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If the user leaves before the "Salvo" delay ends, don't yank them back
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const isTransfer = mode === 'transfer'
  const txType = mode === 'income' ? 'income' : 'expense'

  const categories = useLiveQuery(
    async () => sortCategories(await db.categories.where('type').equals(txType).toArray()),
    [txType],
  )
  const accounts = useAccounts()
  const { accounts: balances } = useAccountBalances()
  const cardSummaries = useCardSummaries()

  const open = accounts?.filter(a => !a.archived && a.kind !== 'loan') ?? []
  const banks = open.filter(isCashAccount)
  const cards = open.filter(a => a.kind === 'credit')
  // Editing keeps an entry in its family: a purchase stays on cards, a plain entry off them
  const fromOptions =
    edit?.kind === 'purchase' ? cards
      : edit?.kind === 'tx' || mode !== 'expense' ? banks
        : open
  const toOptions = initial.invoiceMonth !== undefined
    ? open.filter(a => a.id === initial.toId || isCashAccount(a))
    : banks

  // Effective account: explicit choice → app filter → last used → first option
  const pickFrom = (id: number | null) => (id !== null && fromOptions.some(a => a.id === id) ? id : null)
  const accountId =
    pickFrom(accountChoice) ?? pickFrom(defaultAccountId) ?? pickFrom(Number(readLocal(STORAGE_KEYS.lastAccount)) || null) ?? (fromOptions[0]?.id ?? null)
  const pickTo = (id: number | null) => (id !== null && id !== accountId && toOptions.some(a => a.id === id) ? id : null)
  const toId = pickTo(toChoice) ?? (toOptions.find(a => a.id !== accountId)?.id ?? null)

  const account = open.find(a => a.id === accountId)
  const isCard = !isTransfer && account?.kind === 'credit'

  // Payment method: explicit choice → last used on this account → wallet = cash, else Pix
  const storedMethod = accountId !== null ? readLocal(STORAGE_KEYS.lastMethod(accountId)) as PaymentMethod | null : null
  const method: PaymentMethod | null = isTransfer || isCard ? null
    : methodChoice ?? (storedMethod && ACCOUNT_METHODS.includes(storedMethod) ? storedMethod : account?.kind === 'wallet' ? 'cash' : 'pix')

  function switchMode(next: Mode) {
    setMode(next)
    setCategoryId('')
    setCreatingCategory(false)
    setCreatingAccount(null)
    setError(null)
  }

  function chooseFrom(id: number) {
    if (isTransfer && id === toId) setToChoice(accountId) // picking the destination as origin swaps them
    setAccountChoice(id)
    setMethodChoice(null)
  }

  function chooseTo(id: number) {
    if (id === accountId) setAccountChoice(toId)
    setToChoice(id)
  }

  function handleAmount(value: string) {
    setDigits(value.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS))
    setError(null)
  }

  async function createCategory(value: { name: string; icon: string }) {
    const id = await addCategory({ ...value, type: txType })
    setCategoryId(id)
    setCreatingCategory(false)
    setError(null)
  }

  async function newAccount(value: AccountInput, side: 'from' | 'to') {
    const id = await createAccount(value)
    if (side === 'to') setToChoice(id)
    else setAccountChoice(id)
    setCreatingAccount(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(digits)
    if (!Number.isInteger(amount) || amount <= 0) return setError('Informe um valor maior que zero.')
    if (accountId === null) return setError('Escolha uma conta.')
    if (isTransfer && toId === null) return setError('Escolha a conta de destino.')
    if (!isTransfer && categoryId === '') return setError('Escolha uma categoria.')

    setSaving(true)
    setError(null)
    try {
      if (isTransfer) {
        const input = { fromAccountId: accountId, toAccountId: toId as number, amount, date, description, invoiceMonth: initial.invoiceMonth }
        if (edit?.kind === 'transfer') await updateTransfer(edit.id, input)
        else await createTransfer(input)
      } else if (isCard) {
        const input = { accountId, categoryId: Number(categoryId), date, description, total: amount, installments }
        if (edit?.kind === 'purchase') await updateCardPurchase(edit.id, input)
        else await createCardPurchase(input)
      } else {
        const input = { type: txType, amount, categoryId: Number(categoryId), accountId, method: method ?? undefined, date, description } as const
        if (edit?.kind === 'tx') await updateTransaction(edit.id, input)
        else await addTransaction(input)
        if (method) writeLocal(STORAGE_KEYS.lastMethod(accountId), method)
      }
      writeLocal(STORAGE_KEYS.lastAccount, String(accountId))
      void requestPersistentStorageOnce()
      setSuccess(true)
      if (!isEdit) {
        setDigits('')
        setDescription('')
        setCategoryId('')
        setInstallments(1)
        setDate(todayISO())
      }
      savedTimer.current = setTimeout(() => {
        setSuccess(false)
        onSaved?.()
      }, isEdit ? 450 : 900)
    } catch (err) {
      setError(err instanceof LedgerError ? err.message : 'Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!edit) return
    try {
      if (edit.kind === 'tx') await deleteTransaction(edit.id)
      else if (edit.kind === 'purchase') await deleteCardPurchase(edit.id)
      else await deleteTransfer(edit.id)
      onSaved?.()
    } catch (err) {
      setError(err instanceof LedgerError ? err.message : 'Não foi possível excluir.')
      setConfirmDelete(false)
    }
  }

  const activeColor = isTransfer ? 'text-ink' : mode === 'expense' ? 'text-expense' : 'text-income'
  const saveVariant = isTransfer ? 'primary' : mode === 'expense' ? 'solid-expense' : 'solid-income'
  const display = formatDigits(digits)
  const amountSize = display.length > 12 ? 'text-[34px]' : display.length > 9 ? 'text-[40px]' : 'text-[48px]'
  const quickDates = [{ label: 'Hoje', value: todayISO() }, { label: 'Ontem', value: yesterdayISO() }]

  // Installment preview — the same split and invoice rule the ledger will apply
  const amount = Number(digits || '0')
  const preview = isCard && account?.card && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? (() => {
      const inv = invoiceFor(date, account.card.closingDay, account.card.dueDay)
      const parts = splitInstallments(amount, installments)
      const due = `${Number(inv.dueDate.slice(8))}/${inv.dueDate.slice(5, 7)}`
      return {
        each: parts[0],
        evenly: parts.every(p => p === parts[0]),
        first: formatMonthShortYear(inv.invoiceMonth),
        budgetMonth: formatMonthAbbr(inv.invoiceMonth),
        due,
      }
    })()
    : null

  // Not blocked, just shown: the account (or card limit) money leaves from would go negative
  let warning: string | null = null
  if (!isEdit && amount > 0) {
    if (isCard && accountId !== null) {
      const available = cardSummaries?.get(accountId)?.available
      if (available != null && available - amount < 0) warning = `O limite disponível do ${account?.name} ficará em −${formatBRL(amount - available)}`
    } else if (mode === 'expense' || isTransfer) {
      const bal = balances.find(a => a.id === accountId)
      if (bal && bal.balance - amount < 0) warning = `${bal.name} ficará com −${formatBRL(amount - bal.balance)}`
    }
  }

  const noAccounts = accounts !== undefined && open.length === 0
  // Expenses and card purchases can be refunded (loan rows and installments are edited elsewhere)
  const refundTarget = !isEdit || initial.mode !== 'expense' || initial.loanRow ? null
    : edit.kind === 'purchase' ? { kind: 'purchase' as const, id: edit.id }
      : edit.kind === 'tx' && !initial.installmentRow ? { kind: 'tx' as const, id: edit.id } : null
  const title = !isEdit ? 'Novo lançamento'
    : edit.kind === 'purchase' ? 'Editar compra no cartão'
      : edit.kind === 'transfer' ? (initial.invoiceMonth ? 'Editar pagamento de fatura' : 'Editar transferência')
        : 'Editar lançamento'
  const saveLabel = saving ? 'Salvando...' : success ? 'Salvo'
    : isEdit ? 'Salvar alterações'
      : isTransfer ? 'Transferir'
        : isCard ? (installments > 1 ? `Lançar ${installments}× no cartão` : 'Lançar no cartão')
          : `Salvar ${mode === 'expense' ? 'despesa' : 'receita'}`

  const newAccountChip = (side: 'from' | 'to') => (
    <button
      type="button"
      onClick={() => setCreatingAccount(side)}
      className={chip({ add: true })}
    >
      <Plus size={14} strokeWidth={2} />
      Nova conta
    </button>
  )

  // Editing can flip expense ↔ income on a plain entry; purchases and transfers keep their kind
  const modes = !isEdit ? MODES : edit.kind === 'tx' ? MODES.filter(m => m.id !== 'transfer') : MODES.filter(m => m.id === mode)

  return (
    <div className="flex-1 flex flex-col md:items-center md:justify-start md:px-10 md:py-12">
      <div className="flex-1 md:flex-none w-full md:max-w-[480px] bg-bg md:bg-surface md:rounded-2xl md:border md:border-border flex flex-col slide-up">

        {/* Header */}
        <div className="flex items-center gap-2 px-3 md:px-4 h-14 border-b border-border">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-border/60 transition-colors"
              aria-label="Voltar"
            >
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
          )}
          <h1 className="m-0 text-[17px] font-semibold text-ink">{title}</h1>
          <span className="ml-auto hidden md:inline text-[11px] text-muted">
            <kbd className="font-sans font-semibold px-1.5 py-0.5 rounded-md border border-border">Esc</kbd> para sair
          </span>
        </div>

        {noAccounts ? (
          /* First run: every movement belongs to an account, so the first one is created here */
          <div className="p-5">
            <p className="text-[14px] text-muted mt-0 mb-4 leading-relaxed">
              Antes do primeiro lançamento, cadastre onde está o seu dinheiro — um banco, a poupança ou a carteira.
            </p>
            <AccountEditor title="Sua primeira conta" onSubmit={v => newAccount(v, 'from')} />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            onKeyDown={e => { if (e.key === 'Escape') onCancel?.() }}
            className="flex-1 flex flex-col"
          >
            {/* Mode toggle */}
            {modes.length > 1 && (
              <div className={`mx-5 mt-5 grid ${modes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} bg-border/70 rounded-xl p-1`} role="radiogroup" aria-label="Tipo">
                {modes.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    onClick={() => switchMode(m.id)}
                    className={[
                      'h-9 rounded-[9px] text-[13px] font-semibold transition-all',
                      mode === m.id
                        ? `bg-surface shadow-sm ${m.id === 'expense' ? 'text-expense' : m.id === 'income' ? 'text-income' : 'text-ink'}`
                        : 'text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {/* Amount */}
            <label className="block px-5 pt-8 pb-7 text-center cursor-text">
              <span className="sr-only">{isCard ? 'Valor total da compra' : 'Valor'}</span>
              <div className={`flex items-baseline justify-center gap-1.5 ${activeColor}`}>
                <span className="text-[20px] font-semibold opacity-60">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus={!isEdit}
                  placeholder="0,00"
                  value={display}
                  onChange={e => handleAmount(e.target.value)}
                  className={`${amountSize} font-bold leading-none tracking-[-.02em] bg-transparent outline-none text-left nums placeholder:text-current placeholder:opacity-30`}
                  style={{ width: `${Math.max(display.length || 4, 4) + 0.5}ch` }}
                />
              </div>
              {isCard && <div className="mt-2 text-[12px] text-muted">valor total da compra</div>}
            </label>

            <div className="h-px bg-border mx-5" />

            {/* Account(s) */}
            <div className="pt-5">
              <SectionTitle>{isTransfer ? 'De' : mode === 'expense' && !isEdit ? 'Conta ou cartão' : 'Conta'}</SectionTitle>
              <AccountChips
                label={isTransfer ? 'Conta de origem' : 'Conta'}
                accounts={fromOptions}
                value={accountId}
                onChange={chooseFrom}
              />
              {!isTransfer && !isEdit && creatingAccount === null && (
                <div className="px-5 mt-2">{newAccountChip('from')}</div>
              )}
              {creatingAccount === 'from' && (
                <div className="px-5 mt-3">
                  <AccountEditor title="Nova conta" onSubmit={v => newAccount(v, 'from')} onCancel={() => setCreatingAccount(null)} />
                </div>
              )}
            </div>

            {/* How it was paid — or, on a card, in how many installments */}
            {!isTransfer && !isCard && (
              <div className="pt-5">
                <SectionTitle>{mode === 'expense' ? 'Pago com' : 'Recebido por'}</SectionTitle>
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pb-1 md:flex-wrap" role="radiogroup" aria-label="Forma de pagamento">
                  {ACCOUNT_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={method === m}
                      onClick={() => setMethodChoice(m)}
                      className={[
                        'h-8 px-3 rounded-full border text-[12px] font-semibold whitespace-nowrap transition-colors',
                        method === m ? 'bg-ink border-ink text-bg' : 'border-border text-muted hover:text-ink',
                      ].join(' ')}
                    >
                      {PAYMENT_METHODS[m]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isCard && (
              <div className="pt-5">
                <SectionTitle>Parcelas</SectionTitle>
                <div className="px-5 flex items-center gap-3">
                  <div className="flex items-center rounded-full border border-border bg-surface">
                    <button
                      type="button"
                      aria-label="Menos parcelas"
                      onClick={() => setInstallments(n => Math.max(1, n - 1))}
                      disabled={installments <= 1}
                      className="w-10 h-10 flex items-center justify-center text-ink disabled:opacity-30"
                    >
                      <Minus size={16} strokeWidth={2} />
                    </button>
                    <span className="w-12 text-center text-[15px] font-bold nums text-ink" aria-live="polite">{installments}×</span>
                    <button
                      type="button"
                      aria-label="Mais parcelas"
                      onClick={() => setInstallments(n => Math.min(MAX_UI_INSTALLMENTS, n + 1))}
                      disabled={installments >= MAX_UI_INSTALLMENTS}
                      className="w-10 h-10 flex items-center justify-center text-ink disabled:opacity-30"
                    >
                      <Plus size={16} strokeWidth={2} />
                    </button>
                  </div>
                  <p className="m-0 flex-1 text-[12px] text-muted leading-snug nums">
                    {preview ? (
                      <>
                        {installments > 1 && (
                          <span className="font-semibold text-ink">
                            {preview.evenly ? `${installments}× ${formatBRL(preview.each)}` : `1ª ${formatBRL(preview.each)} + ${installments - 1}× ${formatBRL(splitInstallments(amount, installments)[1])}`}
                          </span>
                        )}
                        {installments > 1 ? ' · 1ª' : 'Entra'} na fatura de {preview.first} (vence {preview.due})
                        {' · conta no orçamento de '}{preview.budgetMonth}
                      </>
                    ) : 'Informe o valor total; as parcelas são calculadas.'}
                  </p>
                </div>
              </div>
            )}

            {isTransfer && (
              <div className="pt-3">
                <div className="flex justify-center text-muted" aria-hidden><ArrowDown size={16} strokeWidth={1.75} /></div>
                <SectionTitle>Para</SectionTitle>
                {toOptions.length > 1 && (
                  <AccountChips
                    label="Conta de destino"
                    accounts={toOptions}
                    value={toId}
                    disabledId={accountId}
                    onChange={chooseTo}
                  />
                )}
                {toOptions.length < 2 && creatingAccount !== 'to' && (
                  <p className="px-5 m-0 mb-2 text-[13px] text-muted">Para transferir, cadastre outra conta.</p>
                )}
                {!isEdit && creatingAccount === null && <div className="px-5 mt-2">{newAccountChip('to')}</div>}
                {creatingAccount === 'to' && (
                  <div className="px-5 mt-3">
                    <AccountEditor title="Conta de destino" onSubmit={v => newAccount(v, 'to')} onCancel={() => setCreatingAccount(null)} />
                  </div>
                )}
                {!isEdit && cards.length > 0 && (
                  <p className="px-5 mt-2 mb-0 text-[12px] text-muted">Para pagar um cartão, use “Pagar fatura” na tela do cartão.</p>
                )}
              </div>
            )}

            {/* Category chips — transfers have none: they are neither income nor expense */}
            {!isTransfer && (
              <div className="pt-5">
                <SectionTitle>Categoria</SectionTitle>
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pb-1 md:flex-wrap md:overflow-visible">
                  {categories?.map(cat => {
                    const selected = categoryId === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => { setCategoryId(cat.id ?? ''); setError(null) }}
                        className={chip({ selected, tone: mode === 'expense' ? 'expense' : 'income' })}
                      >
                        {cat.parentId != null && <span className="text-muted -mr-0.5" aria-hidden>↳</span>}
                        <span aria-hidden>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </button>
                    )
                  })}
                  {categories !== undefined && !creatingCategory && (
                    <button
                      type="button"
                      onClick={() => setCreatingCategory(true)}
                      className={chip({ add: true })}
                    >
                      <Plus size={14} strokeWidth={2} />
                      Nova
                    </button>
                  )}
                  {categories === undefined && <span className="text-sm text-muted">Carregando...</span>}
                </div>
                {creatingCategory && (
                  <div className="px-5 mt-3">
                    <CategoryEditor
                      type={txType}
                      submitLabel="Criar e usar"
                      onSubmit={createCategory}
                      onCancel={() => setCreatingCategory(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Description + date */}
            <div className="mx-5 mt-5 bg-surface border border-border rounded-xl divide-y divide-border focus-within:border-muted/50 transition-colors">
              <input
                type="text"
                placeholder="Descrição (opcional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full h-12 px-4 bg-transparent text-[15px] text-ink placeholder:text-muted outline-none"
              />
              <div className="flex items-center gap-2 pl-4 pr-3 h-12">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  aria-label={isCard ? 'Data da compra' : 'Data'}
                  className="flex-1 min-w-0 bg-transparent text-[15px] text-ink outline-none nums"
                />
                {quickDates.map(q => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setDate(q.value)}
                    className={[
                      'h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors',
                      date === q.value ? 'bg-ink text-bg border-ink' : 'border-border text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="px-5 mt-auto md:mt-6 pt-6 pb-5">
              {warning && <p className="text-[12px] text-expense text-center mt-0 mb-3 nums">{warning}</p>}
              {error && <p className="text-[13px] text-expense text-center mt-0 mb-3" role="alert">{error}</p>}
              <Button
                type="submit"
                variant={saveVariant}
                fullWidth
                disabled={
                  saving || success || digits === '' || accountId === null ||
                  (isTransfer ? toId === null : categoryId === '')
                }
                className="flex items-center justify-center gap-2"
              >
                {success && <Check size={18} strokeWidth={2.5} />}
                {saveLabel}
              </Button>

              {isEdit && (
                confirmDelete ? (
                  <div className="mt-3 flex items-center justify-center gap-2 slide-up">
                    <span className="text-[13px] text-muted">
                      {edit.kind === 'purchase' && installments > 1 ? `Excluir a compra e as ${installments} parcelas?` : 'Excluir de vez?'}
                    </span>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="h-8 px-3 rounded-full text-[12px] font-semibold text-muted hover:text-ink">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => void handleDelete()} className="h-8 px-3 rounded-full bg-ink text-bg text-[12px] font-semibold">
                      Excluir
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="mt-3 w-full h-10 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink hover:bg-border/40 transition-colors"
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                    Excluir {edit.kind === 'purchase' ? 'compra' : edit.kind === 'transfer' ? (initial.invoiceMonth ? 'pagamento' : 'transferência') : 'lançamento'}
                  </button>
                )
              )}
            </div>
          </form>
        )}
        {isEdit && refundTarget && <RefundPanel target={refundTarget} total={initial.amountTotal} minDate={initial.date} />}
      </div>
    </div>
  )
}
