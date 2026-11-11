import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CornerDownRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { CategoryError, addCategory, db, deleteCategory, sortCategories, updateCategory } from '../../core/db'
import { CategoryEditor } from './CategoryEditor'
import type { Category } from '../../core/types'
import { STORAGE_KEYS } from '../../shared/constants/storageKeys'
import { readLocal, writeLocal } from '../../shared/utils/storage'
import { css, cx } from '../../../styled-system/css'
import { nums, slideUp } from '../../shared/ui/atoms'

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
    <section className={css({ mt: '6' })}>
      <div className={css({ px: '5', md: { px: '1' }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '2' })}>
        <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Categorias</div>
        <div className={css({ display: 'inline-flex', bg: 'border/70', rounded: 'full', p: '0.5' })} role="tablist" aria-label="Tipo de categoria">
          {(['expense', 'income'] as const).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              onClick={() => switchType(t)}
              className={css({ h: '7', px: '3', rounded: 'full', fontSize: '12', fontWeight: 'semibold', transition: 'colors' }, type === t ? { bg: 'surface', color: 'ink', shadow: 'sm' } : { color: 'muted', _hover: { color: 'ink' } })}
            >
              {t === 'expense' ? 'Despesas' : 'Receitas'}
            </button>
          ))}
        </div>
      </div>

      {regroup.length > 0 && (
        <div className={css({ mx: '5', md: { mx: '0' }, mb: '3', rounded: '2xl', borderWidth: '1px', borderColor: 'border', bg: 'surface', px: '4', py: '3' })}>
          <div className={css({ fontSize: '13', fontWeight: 'semibold', color: 'ink' })}>Agrupar em subcategorias?</div>
          <p className={css({ fontSize: '12', color: 'muted', mt: '0.5', mb: '2.5', lineHeight: 'relaxed' })}>
            {regroup.map(r => `${r.child.name} dentro de ${r.parent.name}`).join(' · ')}. Os lançamentos continuam iguais; só a organização muda.
          </p>
          <div className={css({ display: 'flex', gap: '2' })}>
            <button onClick={() => void applyRegroup()} className={css({ h: '8', px: '3.5', rounded: 'full', bg: 'ink', color: 'bg', fontSize: '12', fontWeight: 'semibold' })}>Agrupar</button>
            <button onClick={dismissRegroup} className={css({ h: '8', px: '3', rounded: 'full', fontSize: '12', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' } })}>Agora não</button>
          </div>
        </div>
      )}

      <div className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', overflow: 'hidden' })}>
        <ul className={css({ m: '0', p: '0', listStyle: 'none', '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' } })}>
          {cats.map(cat => {
            const id = cat.id as number
            const used = data?.usage.get(id) ?? 0
            const isChild = cat.parentId != null
            const parentOptions = hasChildren(id) ? undefined : tops.filter(t => t.id !== id)
            const childEditor = editing?.mode === 'new-child' && editing.parentId === id && (
              <li key={`${id}-new`} className={css({ p: '2', pl: '8' })}>
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
                <li key={id} className={css({ p: '2' })}>
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
              <li key={id} className={cx(css({ display: 'flex', alignItems: 'center', gap: '3', pr: '2', h: '14' }, isChild ? { pl: '8' } : { pl: '4' }), 'group')}>
                {isChild && <CornerDownRight size={14} strokeWidth={1.75} className={css({ color: 'muted', ml: '-3', flexShrink: '0' })} aria-hidden />}
                <div
                  className={css(isChild ? { w: '8', h: '8', fontSize: '14' } : { w: '9', h: '9', fontSize: '16' }, { rounded: 'tile', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' }, type === 'income' ? { bg: 'income.light' } : { bg: 'expense.light' })}
                  aria-hidden
                >
                  {cat.icon}
                </div>
                <div className={css({ flex: '1', minW: '0' })}>
                  <div className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{cat.name}</div>
                  <div className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>
                    {used === 0 ? 'Sem lançamentos' : `${used} ${used === 1 ? 'lançamento' : 'lançamentos'}`}
                  </div>
                </div>
                {confirming ? (
                  <div className={cx(css({ display: 'flex', alignItems: 'center', gap: '1.5' }), slideUp)}>
                    <button
                      onClick={() => setEditing(null)}
                      className={css({ h: '8', px: '3', rounded: 'full', fontSize: '12', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' } })}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => void remove(id)}
                      className={css({ h: '8', px: '3', rounded: 'full', bg: 'ink', color: 'bg', fontSize: '12', fontWeight: 'semibold' })}
                    >
                      Excluir
                    </button>
                  </div>
                ) : (
                  <div className={css({ display: 'flex', alignItems: 'center' })}>
                    {!isChild && (
                      <button
                        onClick={() => { setEditing({ mode: 'new-child', parentId: id }); setError(null) }}
                        aria-label={`Nova subcategoria em ${cat.name}`}
                        title="Nova subcategoria"
                        className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'bg' }, transition: 'colors' })}
                      >
                        <Plus size={16} strokeWidth={1.75} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditing({ mode: 'edit', id }); setError(null) }}
                      aria-label={`Editar ${cat.name}`}
                      className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'bg' }, transition: 'colors' })}
                    >
                      <Pencil size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => { setEditing({ mode: 'delete', id }); setError(null) }}
                      disabled={used > 0 || hasChildren(id)}
                      aria-label={`Excluir ${cat.name}`}
                      title={used > 0 ? 'Em uso — não pode ser excluída' : hasChildren(id) ? 'Tem subcategorias' : undefined}
                      className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'bg' }, transition: 'colors', _disabled: { opacity: '0.3', _hover: { bg: 'transparent', color: 'muted' }, cursor: 'not-allowed' } })}
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

        <div className={css({ borderTopWidth: '1px', borderColor: 'border', p: '2' })}>
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
              className={css({ w: 'full', h: '11', rounded: 'xl', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5', fontSize: '14', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' }, transition: 'colors' })}
            >
              <Plus size={16} strokeWidth={2} />
              Nova categoria de {type === 'expense' ? 'despesa' : 'receita'}
            </button>
          )}
        </div>
      </div>

      <p className={css({ px: '5', md: { px: '1' }, mt: '2', mb: '0', fontSize: '12' }, error ? { color: 'ink' } : { color: 'muted' })} role={error ? 'alert' : undefined}>
        {error ?? 'Use + para criar subcategorias. Categorias com lançamentos podem ser renomeadas, mas não excluídas.'}
      </p>
    </section>
  )
}
