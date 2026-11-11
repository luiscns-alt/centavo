import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, RotateCcw, Trash2, X } from 'lucide-react'
import { db } from '../../core/db'
import { LedgerError, type RefundTarget } from '../../core/ledger/base'
import { createRefund, deleteTransaction } from './ledger'
import { invoiceFor } from '../credit-cards'
import { FieldLabel, MoneyInput } from '../../shared/ui/MoneyInput'
import type { Transaction } from '../../core/types'
import { todayISO, formatMonthYear, formatShortDate } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'


/**
 * Estornos of an expense or card purchase, in its edit screen. A refund lowers the category's
 * spending (and the budget) — never income. On a card it is a credit on the invoice open at its date.
 */
export function RefundPanel({ target, total, minDate }: { target: RefundTarget; total: number; minDate: string }) {
  const refunds = useLiveQuery(
    () => target.kind === 'tx'
      ? db.transactions.where('refundOf').equals(target.id).toArray()
      : db.transactions.where('refundOfPurchase').equals(target.id).toArray(),
    [target.kind, target.id],
  )
  const card = useLiveQuery(async () => {
    if (target.kind !== 'purchase') return null
    const p = await db.purchases.get(target.id)
    return p ? (await db.accounts.get(p.accountId))?.card ?? null : null
  }, [target.kind, target.id])

  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(() => (todayISO() < minDate ? minDate : todayISO()))
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!refunds) return null
  const refunded = refunds.reduce((s, r) => s + r.amount, 0)
  const left = total - refunded
  const creditOn = card && /^\d{4}-\d{2}-\d{2}$/.test(date) ? invoiceFor(date, card.closingDay, card.dueDay).invoiceMonth : null

  async function submit() {
    if (!amount) return
    setBusy(true)
    setError('')
    try {
      await createRefund({ of: target, amount, date, description })
      setOpen(false)
      setAmount(null)
      setDescription('')
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível estornar.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: Transaction) {
    try { await deleteTransaction(r.id!) } catch (e) { setError(e instanceof LedgerError ? e.message : 'Não foi possível excluir.') }
  }

  return (
    <section className="mx-5 mb-5 rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">Estornos</div>
          <div className="text-[12px] text-muted nums">
            {refunded > 0 ? `${formatBRL(refunded)} devolvidos · até ${formatBRL(left)} ainda` : 'Dinheiro de volta reduz o gasto da categoria'}
          </div>
        </div>
        {!open && left > 0 && (
          <button
            type="button"
            onClick={() => { setOpen(true); setAmount(left) }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-[12px] font-semibold text-ink hover:bg-bg"
          >
            <RotateCcw size={13} strokeWidth={2} /> Estornar
          </button>
        )}
      </div>

      {refunds.length > 0 && (
        <ul className="list-none m-0 p-0 border-t border-border divide-y divide-border">
          {refunds.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="text-muted nums w-16 shrink-0">{formatShortDate(r.date)}</span>
              <span className="flex-1 min-w-0 truncate text-ink">{r.description}</span>
              <span className="nums font-semibold text-ink">+{formatBRL(r.amount)}</span>
              <button type="button" onClick={() => void remove(r)} aria-label="Excluir estorno" className="text-muted hover:text-ink">
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="border-t border-border p-4 slide-up">
          <div className="flex items-center justify-between mb-2">
            <FieldLabel>Valor devolvido</FieldLabel>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cancelar estorno" className="text-muted hover:text-ink -mt-1.5">
              <X size={16} />
            </button>
          </div>
          <MoneyInput value={amount} onChange={setAmount} label="Valor do estorno" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={date}
              min={minDate}
              onChange={e => setDate(e.target.value)}
              aria-label="Data do estorno"
              className="h-11 px-3 rounded-[10px] border border-border bg-bg text-[14px] text-ink nums outline-none"
            />
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Motivo (opcional)"
              className="h-11 px-3 rounded-[10px] border border-border bg-bg text-[14px] text-ink placeholder:text-muted outline-none min-w-0"
            />
          </div>
          {creditOn && <p className="mt-2 mb-0 text-[12px] text-muted">Crédito na fatura de {formatMonthYear(creditOn)}.</p>}
          {error && <p className="mt-2 mb-0 text-[12px] text-expense" role="alert">{error}</p>}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !amount}
            className="mt-3 w-full h-10 rounded-xl bg-ink text-bg text-[13px] font-semibold disabled:opacity-40"
          >
            Estornar {amount ? formatBRL(amount) : ''}
          </button>
        </div>
      )}
      {!open && error && <p className="px-4 pb-3 m-0 text-[12px] text-expense" role="alert">{error}</p>}
    </section>
  )
}

/** A refund row opened from a list: read-only (it follows its original), can be deleted */
export function RefundDetail({ id, onDone, onCancel }: { id: number; onDone: () => void; onCancel?: () => void }) {
  const data = useLiveQuery(async () => {
    const r = await db.transactions.get(id)
    if (!r) return null
    const [category, account] = await Promise.all([db.categories.get(r.categoryId), db.accounts.get(r.accountId)])
    return { r, category, account }
  }, [id])
  const [error, setError] = useState('')
  if (!data) return <div className="flex-1" />
  const { r, category, account } = data

  async function remove() {
    try { await deleteTransaction(id); onDone() } catch (e) { setError(e instanceof LedgerError ? e.message : 'Não foi possível excluir.') }
  }

  const rows: [string, string][] = [
    ['Categoria', `${category?.icon ?? ''} ${category?.name ?? '—'}`],
    [account?.kind === 'credit' ? 'Cartão' : 'Conta', account?.name ?? '—'],
    ['Data', formatShortDate(r.date)],
    ...(r.invoiceMonth ? [['Fatura', formatMonthYear(r.invoiceMonth)] as [string, string]] : []),
  ]

  return (
    <div className="flex-1 flex flex-col md:items-center md:px-10 md:py-12">
      <div className="w-full md:max-w-[480px] bg-bg md:bg-surface md:rounded-2xl md:border md:border-border slide-up">
        <div className="flex items-center gap-2 px-3 md:px-4 h-14 border-b border-border">
          {onCancel && (
            <button onClick={onCancel} aria-label="Voltar" className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-border/60">
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
          )}
          <h1 className="m-0 text-[17px] font-semibold text-ink">Estorno</h1>
        </div>
        <div className="px-5 pt-8 pb-6 text-center">
          <div className="font-serif text-[44px] leading-none text-ink nums">+{formatBRL(r.amount)}</div>
          <p className="text-[13px] text-muted mt-2 mb-0">{r.description}</p>
        </div>
        <dl className="mx-5 rounded-xl border border-border bg-surface divide-y divide-border text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted">{k}</dt><dd className="text-ink m-0">{v}</dd></div>
          ))}
        </dl>
        <p className="mx-5 mt-3 text-[12px] text-muted">Para mudar o valor, exclua e estorne de novo pela despesa original.</p>
        {error && <p className="mx-5 text-[12px] text-expense" role="alert">{error}</p>}
        <div className="p-5">
          <button onClick={() => void remove()} className="w-full h-10 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink hover:bg-border/40">
            <Trash2 size={15} strokeWidth={1.75} /> Excluir estorno
          </button>
        </div>
      </div>
    </div>
  )
}
