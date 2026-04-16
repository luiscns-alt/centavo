import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Transaction } from '../db'

type TransactionType = 'income' | 'expense'

const today = () => new Date().toISOString().slice(0, 10)

export function AddTransactionForm() {
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const categories = useLiveQuery(() => db.categories.where('type').equals(type).toArray(), [type])
  const accounts = useLiveQuery(() => db.accounts.toArray())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || !categoryId || !accountId) return

    setSaving(true)
    try {
      const tx: Omit<Transaction, 'id'> = {
        accountId: Number(accountId),
        categoryId: Number(categoryId),
        amount: parseFloat(amount),
        type,
        description,
        date: new Date(date + 'T12:00:00'),
        createdAt: new Date(),
      }
      await db.transactions.add(tx as Transaction)
      setAmount('')
      setDescription('')
      setCategoryId('')
      setDate(today())
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const selectedCategory = categories?.find(c => c.id === categoryId)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-start justify-center pt-8 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
          Nova transação
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => { setType('expense'); setCategoryId('') }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                type === 'expense'
                  ? 'bg-red-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => { setType('income'); setCategoryId('') }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                type === 'income'
                  ? 'bg-green-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Receita
            </button>
          </div>

          {/* Amount */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Valor (R$)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              className="w-full text-3xl font-semibold text-gray-900 dark:text-gray-100 bg-transparent outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
            />
          </div>

          {/* Category */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Categoria</label>
            <div className="grid grid-cols-3 gap-2">
              {categories?.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs transition-colors ${
                    categoryId === cat.id
                      ? 'bg-gray-50 dark:bg-gray-700'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  style={categoryId === cat.id ? { outline: `2px solid ${cat.color}` } : {}}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="text-gray-600 dark:text-gray-300 leading-tight text-center">{cat.name}</span>
                  {categoryId === cat.id && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                </button>
              ))}
              {!categories?.length && (
                <p className="col-span-3 text-sm text-gray-400">Carregando categorias…</p>
              )}
            </div>
          </div>

          {/* Account */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Conta</label>
            {accounts && accounts.length > 0 ? (
              <select
                value={accountId}
                onChange={e => setAccountId(Number(e.target.value))}
                required
                className="w-full bg-transparent text-gray-900 dark:text-gray-100 outline-none text-sm"
              >
                <option value="">Selecione uma conta</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} — {acc.currency}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400">Nenhuma conta cadastrada ainda.</p>
            )}
          </div>

          {/* Description + Date */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            <div className="p-4">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descrição</label>
              <input
                type="text"
                placeholder="Opcional"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-transparent text-gray-900 dark:text-gray-100 outline-none text-sm placeholder:text-gray-300 dark:placeholder:text-gray-600"
              />
            </div>
            <div className="p-4">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full bg-transparent text-gray-900 dark:text-gray-100 outline-none text-sm"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !amount || !categoryId || !accountId}
            className={`w-full py-4 rounded-xl font-medium text-white transition-all ${
              type === 'expense'
                ? 'bg-red-500 hover:bg-red-600 disabled:bg-red-200'
                : 'bg-green-500 hover:bg-green-600 disabled:bg-green-200'
            } disabled:cursor-not-allowed`}
          >
            {saving ? 'Salvando…' : success ? '✓ Salvo!' : `Adicionar ${type === 'expense' ? 'despesa' : 'receita'}`}
          </button>

          {selectedCategory && (
            <p className="text-center text-xs text-gray-400">
              {selectedCategory.icon} {selectedCategory.name}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
