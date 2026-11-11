import { useState } from 'react'
import { X } from 'lucide-react'
import { CategoryError } from '../../core/db'
import type { Category } from '../../core/types'
import { firstGrapheme } from '../../shared/utils/text'
import { css, cx } from '../../../styled-system/css'
import { noScrollbar, slideUp } from '../../shared/ui/atoms'

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
      className={cx(css({ bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: 'xl', p: '3' }), slideUp)}
      onKeyDown={e => {
        // Handled here so Esc closes the editor, not the whole form
        if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void submit() }
      }}
    >
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
        <input
          aria-label="Emoji"
          value={icon}
          onChange={e => setIcon(firstGrapheme(e.target.value.replace(icon, '')) || firstGrapheme(e.target.value))}
          className={css({ w: '11', h: '11', flexShrink: '0', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', textAlign: 'center', fontSize: '20', outline: 'none', _focus: { borderColor: 'muted/60' } })}
        />
        <input
          autoFocus
          aria-label="Nome da categoria"
          placeholder={type === 'expense' ? 'Ex.: Academia' : 'Ex.: Aulas particulares'}
          value={name}
          maxLength={24}
          onChange={e => { setName(e.target.value); setError(null) }}
          className={css({ flex: '1', minW: '0', h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '15', color: 'ink', _placeholder: { color: 'muted' }, outline: 'none', _focus: { borderColor: 'muted/60' } })}
        />
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          className={css({ w: '9', h: '9', flexShrink: '0', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'bg' }, transition: 'colors' })}
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className={cx(css({ mt: '2.5', display: 'flex', gap: '1', overflowX: 'auto', md: { flexWrap: 'wrap' } }), noScrollbar)} role="radiogroup" aria-label="Sugestões de emoji">
        {SUGGESTED[type].map(e => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={icon === e}
            onClick={() => setIcon(e)}
            className={css({ w: '9', h: '9', flexShrink: '0', rounded: '[9px]', fontSize: '18', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'colors' }, icon === e ? { bg: 'border' } : { _hover: { bg: 'bg' } })}
          >
            {e}
          </button>
        ))}
      </div>

      {parents && parents.length > 0 && (
        <label className={css({ mt: '3', display: 'flex', alignItems: 'center', gap: '2', fontSize: '13', color: 'muted' })}>
          Dentro de
          <select
            value={parentId ?? ''}
            onChange={e => setParentId(e.target.value === '' ? null : Number(e.target.value))}
            className={css({ flex: '1', minW: '0', h: '9', px: '2', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none' })}
          >
            <option value="">Nenhuma (categoria principal)</option>
            {parents.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
          </select>
        </label>
      )}

      <div className={css({ mt: '3', display: 'flex', alignItems: 'center', gap: '3' })}>
        <p className={css({ flex: '1', m: '0', fontSize: '12' }, error ? { color: 'expense' } : { color: 'muted' })} role={error ? 'alert' : undefined}>
          {error ?? 'Escolha um emoji ou digite o seu.'}
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || name.trim() === ''}
          className={css({ h: '9', px: '4', rounded: 'full', bg: 'ink', color: 'bg', fontSize: '13', fontWeight: 'semibold', transition: 'opacity', _hover: { opacity: '0.9' }, _disabled: { opacity: '0.4', cursor: 'not-allowed' } })}
        >
          {busy ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
