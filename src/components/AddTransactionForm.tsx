import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { db, parseBRL, todayISO, type Transaction } from '../db'
import { Button } from './ui/Button'

type TxType = 'income' | 'expense'

interface Props {
  onSaved?: () => void
  onCancel?: () => void
}

export function AddTransactionForm({ onSaved, onCancel }: Props) {
  const [type, setType] = useState<TxType>('expense')
  const [amountRaw, setAmountRaw] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If the user leaves before the "Salvo!" delay ends, don't yank them back to home
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const categories = useLiveQuery(
    () => db.categories.where('type').equals(type).toArray(),
    [type],
  )

  function switchType(next: TxType) {
    setType(next)
    setCategoryId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseBRL(amountRaw)
    if (amount === null || amount <= 0) {
      setError('Valor inválido. Use o formato 12,50.')
      return
    }
    if (categoryId === '') return

    setSaving(true)
    setError(null)
    try {
      const tx: Omit<Transaction, 'id'> = {
        type,
        amount,
        categoryId: Number(categoryId),
        description: description.trim() || undefined,
        date,
        createdAt: Date.now(),
      }
      await db.transactions.add(tx as Transaction)
      setAmountRaw('')
      setDescription('')
      setCategoryId('')
      setDate(todayISO())
      setSuccess(true)
      savedTimer.current = setTimeout(() => {
        setSuccess(false)
        onSaved?.()
      }, 900)
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const isExpense    = type === 'expense'
  const activeColor  = isExpense ? 'text-expense' : 'text-income'
  const chipActive   = isExpense
    ? 'bg-expense-light border-expense text-expense'
    : 'bg-income-light border-income text-income'
  const saveVariant  = isExpense ? 'solid-expense' : 'solid-income'
  const saveLabel    = saving ? 'Salvando...' : success ? 'Salvo!' : `Salvar ${isExpense ? 'despesa' : 'receita'}`

  return (
    /* Desktop: center the card in the available space */
    <div className="flex-1 bg-bg flex flex-col md:items-start md:justify-start md:p-10">

      {/* Card wrapper — full-height on mobile, card on desktop */}
      <div className="flex-1 md:flex-none w-full md:max-w-[480px] md:bg-surface md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-muted hover:text-ink transition-colors -ml-1 p-1"
              aria-label="Voltar"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
          )}
          <span className="text-[17px] font-semibold text-ink">Novo lançamento</span>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">

          {/* Type toggle */}
          <div className="mx-5 mt-5 flex bg-border rounded-xl p-1">
            {(['expense', 'income'] as TxType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => switchType(t)}
                className={[
                  'flex-1 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all',
                  type === t
                    ? `bg-surface shadow-sm ${t === 'expense' ? 'text-expense' : 'text-income'}`
                    : 'text-muted',
                ].join(' ')}
              >
                {t === 'expense' ? 'Despesa' : 'Receita'}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="px-5 py-6 border-b border-border text-center">
            <div className={`text-[13px] font-semibold ${activeColor} opacity-60 mb-1`}>R$</div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amountRaw}
              onChange={e => setAmountRaw(e.target.value)}
              className={`text-[48px] font-bold leading-none bg-transparent outline-none text-center w-full nums ${activeColor}`}
            />
          </div>

          {/* Category chips */}
          <div className="px-5 pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
              Categoria
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories?.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id ?? '')}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium whitespace-nowrap transition-all',
                    categoryId === cat.id ? chipActive : 'bg-surface border-border text-muted',
                  ].join(' ')}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
              {categories === undefined && (
                <span className="text-sm text-muted">Carregando...</span>
              )}
            </div>
          </div>

          {/* Description + date */}
          <div className="mx-5 mt-4 bg-surface border border-border rounded-xl divide-y divide-border">
            <input
              type="text"
              placeholder="Descrição (opcional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-transparent text-[14px] text-ink placeholder:text-muted outline-none"
            />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 bg-transparent text-[14px] text-ink outline-none"
            />
          </div>

          {/* Save button */}
          <div className="px-5 mt-auto py-5">
            {error && (
              <p className="text-[13px] text-expense text-center mb-3">{error}</p>
            )}
            <Button
              type="submit"
              variant={saveVariant}
              fullWidth
              disabled={saving || amountRaw === '' || categoryId === ''}
            >
              {saveLabel}
            </Button>
          </div>

        </form>
      </div>
    </div>
  )
}
