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
import { css, cx } from '../../../styled-system/css'
import { nums, slideUp } from '../../shared/ui/atoms'


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
    <section className={css({ mx: '5', mb: '5', rounded: 'xl', borderWidth: '1px', borderColor: 'border', bg: 'surface' })}>
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', px: '4', py: '3' })}>
        <div>
          <div className={css({ fontSize: '13', fontWeight: 'semibold', color: 'ink' })}>Estornos</div>
          <div className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>
            {refunded > 0 ? `${formatBRL(refunded)} devolvidos · até ${formatBRL(left)} ainda` : 'Dinheiro de volta reduz o gasto da categoria'}
          </div>
        </div>
        {!open && left > 0 && (
          <button
            type="button"
            onClick={() => { setOpen(true); setAmount(left) }}
            className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', h: '8', px: '3', rounded: 'full', borderWidth: '1px', borderColor: 'border', fontSize: '12', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' } })}
          >
            <RotateCcw size={13} strokeWidth={2} /> Estornar
          </button>
        )}
      </div>

      {refunds.length > 0 && (
        <ul className={css({ listStyle: 'none', m: '0', p: '0', borderTopWidth: '1px', borderColor: 'border', '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' } })}>
          {refunds.map(r => (
            <li key={r.id} className={css({ display: 'flex', alignItems: 'center', gap: '3', px: '4', py: '2.5', fontSize: '13' })}>
              <span className={cx(css({ color: 'muted', w: '16', flexShrink: '0' }), nums)}>{formatShortDate(r.date)}</span>
              <span className={css({ flex: '1', minW: '0', truncate: true, color: 'ink' })}>{r.description}</span>
              <span className={cx(css({ fontWeight: 'semibold', color: 'ink' }), nums)}>+{formatBRL(r.amount)}</span>
              <button type="button" onClick={() => void remove(r)} aria-label="Excluir estorno" className={css({ color: 'muted', _hover: { color: 'ink' } })}>
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className={cx(css({ borderTopWidth: '1px', borderColor: 'border', p: '4' }), slideUp)}>
          <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '2' })}>
            <FieldLabel>Valor devolvido</FieldLabel>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cancelar estorno" className={css({ color: 'muted', _hover: { color: 'ink' }, mt: '-1.5' })}>
              <X size={16} />
            </button>
          </div>
          <MoneyInput value={amount} onChange={setAmount} label="Valor do estorno" />
          <div className={css({ mt: '3', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2' })}>
            <input
              type="date"
              value={date}
              min={minDate}
              onChange={e => setDate(e.target.value)}
              aria-label="Data do estorno"
              className={cx(css({ h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none' }), nums)}
            />
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Motivo (opcional)"
              className={css({ h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', _placeholder: { color: 'muted' }, outline: 'none', minW: '0' })}
            />
          </div>
          {creditOn && <p className={css({ mt: '2', mb: '0', fontSize: '12', color: 'muted' })}>Crédito na fatura de {formatMonthYear(creditOn)}.</p>}
          {error && <p className={css({ mt: '2', mb: '0', fontSize: '12', color: 'expense' })} role="alert">{error}</p>}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !amount}
            className={css({ mt: '3', w: 'full', h: '10', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '13', fontWeight: 'semibold', _disabled: { opacity: '0.4' } })}
          >
            Estornar {amount ? formatBRL(amount) : ''}
          </button>
        </div>
      )}
      {!open && error && <p className={css({ px: '4', pb: '3', m: '0', fontSize: '12', color: 'expense' })} role="alert">{error}</p>}
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
  if (!data) return <div className={css({ flex: '1' })} />
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
    <div className={css({ flex: '1', display: 'flex', flexDirection: 'column', md: { alignItems: 'center', px: '10', py: '12' } })}>
      <div className={cx(css({ w: 'full', md: { maxW: '[480px]', bg: 'surface', rounded: '2xl', borderWidth: '1px', borderColor: 'border' }, bg: 'bg' }), slideUp)}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2', px: '3', md: { px: '4' }, h: '14', borderBottomWidth: '1px', borderColor: 'border' })}>
          {onCancel && (
            <button onClick={onCancel} aria-label="Voltar" className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'border/60' } })}>
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
          )}
          <h1 className={css({ m: '0', fontSize: '17', fontWeight: 'semibold', color: 'ink' })}>Estorno</h1>
        </div>
        <div className={css({ px: '5', pt: '8', pb: '6', textAlign: 'center' })}>
          <div className={cx(css({ fontFamily: 'serif', fontSize: '44', lineHeight: 'none', color: 'ink' }), nums)}>+{formatBRL(r.amount)}</div>
          <p className={css({ fontSize: '13', color: 'muted', mt: '2', mb: '0' })}>{r.description}</p>
        </div>
        <dl className={css({ mx: '5', rounded: 'xl', borderWidth: '1px', borderColor: 'border', bg: 'surface', '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' }, fontSize: '14' })}>
          {rows.map(([k, v]) => (
            <div key={k} className={css({ display: 'flex', justifyContent: 'space-between', gap: '3', px: '4', py: '3' })}><dt className={css({ color: 'muted' })}>{k}</dt><dd className={css({ color: 'ink', m: '0' })}>{v}</dd></div>
          ))}
        </dl>
        <p className={css({ mx: '5', mt: '3', fontSize: '12', color: 'muted' })}>Para mudar o valor, exclua e estorne de novo pela despesa original.</p>
        {error && <p className={css({ mx: '5', fontSize: '12', color: 'expense' })} role="alert">{error}</p>}
        <div className={css({ p: '5' })}>
          <button onClick={() => void remove()} className={css({ w: 'full', h: '10', rounded: 'xl', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5', fontSize: '13', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink', bg: 'border/40' } })}>
            <Trash2 size={15} strokeWidth={1.75} /> Excluir estorno
          </button>
        </div>
      </div>
    </div>
  )
}
