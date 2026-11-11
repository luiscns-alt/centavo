import { useState } from 'react'
import { X } from 'lucide-react'
import { CategoryError, firstGrapheme, type Category } from '../../core/db'

const SUGGESTED: Record<Category['type'], string[]> = {
  expense: ['🏷️', '🛒', '☕', '🍕', '🍺', '⛽', '🚌', '🅿️', '🏋️', '💇', '👕', '🧸', '🎮', '📱', '💡', '🔧', '🌱', '🏥', '🎓', '🐶'],
  income:  ['🏷️', '💰', '💵', '🏦', '🪙', '📊', '🧾', '🤝', '🎯', '🏆', '🛠️', '📦', '🎨', '📸', '🎤', '🏠'],
}

interface Props {
  type: Category['type']
  initial?: { name: string; icon: string; parentId?: number }
  submitLabel?: string
  /** Possible parents (top-level categories of the same type). Omitted = no "Dentro de" field */
  parents?: Pick<Category, 'id' | 'name' | 'icon'>[]
  onSubmit: (value: { name: string; icon: string; parentId: number | null }) => Promise<unknown>
  onCancel: () => void
}

/** Inline name + emoji editor, used to create a category from the form and to edit one in Ajustes */
export function CategoryEditor({ type, initial, submitLabel = 'Adicionar', parents, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? SUGGESTED[type][0])
  const [parentId, setParentId] = useState<number | null>(initial?.parentId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ name, icon, parentId })
    } catch (e) {
      setError(e instanceof CategoryError ? e.message : 'Não foi possível salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="bg-surface border border-border rounded-xl p-3 slide-up"
      onKeyDown={e => {
        // Handled here so Esc closes the editor, not the whole form
        if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void submit() }
      }}
    >
      <div className="flex items-center gap-2">
        <input
          aria-label="Emoji"
          value={icon}
          onChange={e => setIcon(firstGrapheme(e.target.value.replace(icon, '')) || firstGrapheme(e.target.value))}
          className="w-11 h-11 shrink-0 rounded-[10px] border border-border bg-bg text-center text-[20px] outline-none focus:border-muted/60"
        />
        <input
          autoFocus
          aria-label="Nome da categoria"
          placeholder={type === 'expense' ? 'Ex.: Academia' : 'Ex.: Aulas particulares'}
          value={name}
          maxLength={24}
          onChange={e => { setName(e.target.value); setError(null) }}
          className="flex-1 min-w-0 h-11 px-3 rounded-[10px] border border-border bg-bg text-[15px] text-ink placeholder:text-muted outline-none focus:border-muted/60"
        />
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-bg transition-colors"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-2.5 flex gap-1 overflow-x-auto no-scrollbar md:flex-wrap" role="radiogroup" aria-label="Sugestões de emoji">
        {SUGGESTED[type].map(e => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={icon === e}
            onClick={() => setIcon(e)}
            className={[
              'w-9 h-9 shrink-0 rounded-[9px] text-[18px] flex items-center justify-center transition-colors',
              icon === e ? 'bg-border' : 'hover:bg-bg',
            ].join(' ')}
          >
            {e}
          </button>
        ))}
      </div>

      {parents && parents.length > 0 && (
        <label className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          Dentro de
          <select
            value={parentId ?? ''}
            onChange={e => setParentId(e.target.value === '' ? null : Number(e.target.value))}
            className="flex-1 min-w-0 h-9 px-2 rounded-[10px] border border-border bg-bg text-[14px] text-ink outline-none"
          >
            <option value="">Nenhuma (categoria principal)</option>
            {parents.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
          </select>
        </label>
      )}

      <div className="mt-3 flex items-center gap-3">
        <p className={`flex-1 m-0 text-[12px] ${error ? 'text-expense' : 'text-muted'}`} role={error ? 'alert' : undefined}>
          {error ?? 'Escolha um emoji ou digite o seu.'}
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || name.trim() === ''}
          className="h-9 px-4 rounded-full bg-ink text-bg text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
