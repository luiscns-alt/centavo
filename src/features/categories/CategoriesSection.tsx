import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CornerDownRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { CategoryError, addCategory, db, deleteCategory, sortCategories, updateCategory } from '../../core/db'
import { CategoryEditor } from './CategoryEditor'
import type { Category } from '../../core/types'
import { STORAGE_KEYS } from '../../shared/constants/storageKeys'
import { readLocal, writeLocal } from '../../shared/utils/storage'

type Editing = { mode: 'new' } | { mode: 'new-child'; parentId: number } | { mode: 'edit'; id: number } | { mode: 'delete'; id: number } | null

/** Suggested regroup (v7): child → parent, by default names */
const REGROUP: [string, string][] = [['Mercado', 'Alimentação'], ['Assinaturas', 'Entretenimento'], ['Cuidados pessoais', 'Saúde']]

function readDismissed() {
  return readLocal(STORAGE_KEYS.regroupDismissed) === '1'
}

/** Ajustes → Categorias: a two-level tree — create, rename/re-icon, move under a parent, delete unused */
export function CategoriesSection() {
  const [type, setType] = useState<Category['type']>('expense')
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)

  const data = useLiveQuery(async () => {
    const [cats, txs] = await Promise.all([
      db.categories.where('type').equals(type).toArray(),
      db.transactions.where('type').anyOf(type === 'expense' ? ['expense', 'refund'] : ['income']).toArray(),
    ])
    const usage = new Map<number, number>()
    for (const t of txs) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1)
    return { cats: sortCategories(cats), usage }
  }, [type])

  function switchType(next: Category['type']) {
    setType(next)
    setEditing(null)
    setError(null)
  }

  const cats = data?.cats ?? []
  const tops = cats.filter(c => c.parentId == null)
  const hasChildren = (id: number) => cats.some(c => c.parentId === id)
  const byName = (n: string) => tops.find(c => c.name === n)
  const regroup = type === 'expense' && !dismissed
    ? REGROUP.flatMap(([child, parent]) => {
      const c = byName(child), p = byName(parent)
      return c && p && !hasChildren(c.id as number) ? [{ child: c, parent: p }] : []
    })
    : []

  function dismissRegroup() {
    setDismissed(true)
    writeLocal(STORAGE_KEYS.regroupDismissed, '1')
  }

  async function applyRegroup() {
    try {
      for (const { child, parent } of regroup) {
        await updateCategory(child.id as number, { name: child.name, icon: child.icon, parentId: parent.id as number })
      }
      dismissRegroup()
    } catch (e) {
      setError(e instanceof CategoryError ? e.message : 'Não foi possível agrupar.')
    }
  }

  async function remove(id: number) {
    try {
      await deleteCategory(id)
      setEditing(null)
    } catch (e) {
      setError(e instanceof CategoryError ? e.message : 'Não foi possível excluir.')
      setEditing(null)
    }
  }

  return (
    <section className="mt-6">
      <div className="px-5 md:px-1 flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Categorias</div>
        <div className="inline-flex bg-border/70 rounded-full p-0.5" role="tablist" aria-label="Tipo de categoria">
          {(['expense', 'income'] as const).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              onClick={() => switchType(t)}
              className={[
                'h-7 px-3 rounded-full text-[12px] font-semibold transition-colors',
                type === t ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
              ].join(' ')}
            >
              {t === 'expense' ? 'Despesas' : 'Receitas'}
            </button>
          ))}
        </div>
      </div>

      {regroup.length > 0 && (
        <div className="mx-5 md:mx-0 mb-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="text-[13px] font-semibold text-ink">Agrupar em subcategorias?</div>
          <p className="text-[12px] text-muted mt-0.5 mb-2.5 leading-relaxed">
            {regroup.map(r => `${r.child.name} dentro de ${r.parent.name}`).join(' · ')}. Os lançamentos continuam iguais; só a organização muda.
          </p>
          <div className="flex gap-2">
            <button onClick={() => void applyRegroup()} className="h-8 px-3.5 rounded-full bg-ink text-bg text-[12px] font-semibold">Agrupar</button>
            <button onClick={dismissRegroup} className="h-8 px-3 rounded-full text-[12px] font-semibold text-muted hover:text-ink">Agora não</button>
          </div>
        </div>
      )}

      <div className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl overflow-hidden">
        <ul className="m-0 p-0 list-none divide-y divide-border">
          {cats.map(cat => {
            const id = cat.id as number
            const used = data?.usage.get(id) ?? 0
            const isChild = cat.parentId != null
            const parentOptions = hasChildren(id) ? undefined : tops.filter(t => t.id !== id)
            const childEditor = editing?.mode === 'new-child' && editing.parentId === id && (
              <li key={`${id}-new`} className="p-2 pl-8">
                <CategoryEditor
                  type={type}
                  initial={{ name: '', icon: cat.icon, parentId: id }}
                  parents={tops}
                  submitLabel="Criar subcategoria"
                  onSubmit={async v => { await addCategory({ ...v, type }); setEditing(null) }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            )
            if (editing?.mode === 'edit' && editing.id === id) {
              return (
                <li key={id} className="p-2">
                  <CategoryEditor
                    type={type}
                    initial={{ name: cat.name, icon: cat.icon, parentId: cat.parentId }}
                    parents={parentOptions}
                    submitLabel="Salvar"
                    onSubmit={async v => {
                      await updateCategory(id, parentOptions ? v : { name: v.name, icon: v.icon })
                      setEditing(null)
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              )
            }
            const confirming = editing?.mode === 'delete' && editing.id === id
            return [
              <li key={id} className={`group flex items-center gap-3 pr-2 h-14 ${isChild ? 'pl-8' : 'pl-4'}`}>
                {isChild && <CornerDownRight size={14} strokeWidth={1.75} className="text-muted -ml-3 shrink-0" aria-hidden />}
                <div
                  className={`${isChild ? 'w-8 h-8 text-[14px]' : 'w-9 h-9 text-[16px]'} rounded-[10px] flex items-center justify-center shrink-0 ${type === 'income' ? 'bg-income-light' : 'bg-expense-light'}`}
                  aria-hidden
                >
                  {cat.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate">{cat.name}</div>
                  <div className="text-[12px] text-muted nums">
                    {used === 0 ? 'Sem lançamentos' : `${used} ${used === 1 ? 'lançamento' : 'lançamentos'}`}
                  </div>
                </div>
                {confirming ? (
                  <div className="flex items-center gap-1.5 slide-up">
                    <button
                      onClick={() => setEditing(null)}
                      className="h-8 px-3 rounded-full text-[12px] font-semibold text-muted hover:text-ink"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => void remove(id)}
                      className="h-8 px-3 rounded-full bg-ink text-bg text-[12px] font-semibold"
                    >
                      Excluir
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    {!isChild && (
                      <button
                        onClick={() => { setEditing({ mode: 'new-child', parentId: id }); setError(null) }}
                        aria-label={`Nova subcategoria em ${cat.name}`}
                        title="Nova subcategoria"
                        className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-bg transition-colors"
                      >
                        <Plus size={16} strokeWidth={1.75} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditing({ mode: 'edit', id }); setError(null) }}
                      aria-label={`Editar ${cat.name}`}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-bg transition-colors"
                    >
                      <Pencil size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => { setEditing({ mode: 'delete', id }); setError(null) }}
                      disabled={used > 0 || hasChildren(id)}
                      aria-label={`Excluir ${cat.name}`}
                      title={used > 0 ? 'Em uso — não pode ser excluída' : hasChildren(id) ? 'Tem subcategorias' : undefined}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-bg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-not-allowed"
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </li>,
              childEditor,
            ]
          })}
        </ul>

        <div className="border-t border-border p-2">
          {editing?.mode === 'new' ? (
            <CategoryEditor
              type={type}
              parents={tops}
              onSubmit={async v => { await addCategory({ ...v, type }); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button
              onClick={() => { setEditing({ mode: 'new' }); setError(null) }}
              className="w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-semibold text-ink hover:bg-bg transition-colors"
            >
              <Plus size={16} strokeWidth={2} />
              Nova categoria de {type === 'expense' ? 'despesa' : 'receita'}
            </button>
          )}
        </div>
      </div>

      <p className={`px-5 md:px-1 mt-2 mb-0 text-[12px] ${error ? 'text-ink' : 'text-muted'}`} role={error ? 'alert' : undefined}>
        {error ?? 'Use + para criar subcategorias. Categorias com lançamentos podem ser renomeadas, mas não excluídas.'}
      </p>
    </section>
  )
}
