import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { LedgerError, isCashAccount } from '../../core/ledger/base'
import type { AccountInput } from './ledger'
import { bankById, exactBank, normalizeBankText, searchBanks, type Bank } from './banks/catalog'
import { AccountIcon } from './AccountIcon'
import { useAccounts } from './useAccounts'
import { ACCOUNT_KINDS, EDITABLE_KINDS } from '../../core/constants/domain'
import type { AccountKind } from '../../core/types'
import { todayISO } from '../../shared/utils/dates'
import { firstGrapheme } from '../../shared/utils/text'
import { css, cx } from '../../../styled-system/css'

interface Props {
  initial?: AccountInput
  submitLabel?: string
  title?: string
  onSubmit: (value: AccountInput) => Promise<unknown>
  onCancel?: () => void
}

/**
 * How the current bank link came about:
 * - picked: chosen from the suggestions — kept even if the name is edited ("Nubank PJ")
 * - auto: the name matched a bank exactly — follows the name, unlinks if it stops matching
 * - dismissed: the user removed the logo — don't auto-link this same name again
 */
type LinkSource = { kind: 'picked' } | { kind: 'auto' } | { kind: 'dismissed'; text: string } | { kind: 'none' }

const fmt = (digits: string) =>
  digits === '' ? '' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(Number(digits) / 100)

/** Name (with bank suggestions), type, icon and saldo inicial — used in Ajustes and in the form */
export function AccountEditor({ initial, submitLabel = 'Criar conta', title, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'checking')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [bankId, setBankId] = useState<string | null>(initial?.bankId ?? null)
  const [link, setLink] = useState<LinkSource>(initial?.bankId ? { kind: 'picked' } : { kind: 'none' })
  const [digits, setDigits] = useState(initial ? String(Math.abs(initial.openingBalance) || '') : '')
  const [negative, setNegative] = useState((initial?.openingBalance ?? 0) < 0)
  const [openingDate, setOpeningDate] = useState(initial?.openingDate ?? todayISO())
  const [closingDay, setClosingDay] = useState(initial?.card ? String(initial.card.closingDay) : '')
  const [dueDay, setDueDay] = useState(initial?.card ? String(initial.card.dueDay) : '')
  const [limitDigits, setLimitDigits] = useState(initial?.card?.limit ? String(initial.card.limit) : '')
  const [bankAccountId, setBankAccountId] = useState<number | null>(initial?.card?.bankAccountId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const allAccounts = useAccounts()
  // A card belongs to a bank account (not to another card)
  const bankAccounts = allAccounts?.filter(a => isCashAccount(a) && (!a.archived || a.id === bankAccountId)) ?? []
  const isCredit = kind === 'credit'
  const [highlight, setHighlight] = useState(0)
  const listId = useId()

  const bank = bankById(bankId)
  const shownIcon = icon || ACCOUNT_KINDS[kind].icon
  const suggestions = listOpen && !bank ? searchBanks(name) : []

  function changeName(value: string) {
    setName(value)
    setError(null)
    setListOpen(true)
    setHighlight(0)

    if (link.kind === 'picked') return
    const match = exactBank(value)
    if (link.kind === 'dismissed' && normalizeBankText(value) === link.text) return
    if (match) {
      setBankId(match.id)
      setLink({ kind: 'auto' })
      if (match.kind) setKind(match.kind)
    } else if (link.kind === 'auto') {
      setBankId(null)
      setLink({ kind: 'none' })
    }
  }

  function pick(b: Bank) {
    setBankId(b.id)
    setLink({ kind: 'picked' })
    setName(b.name)
    if (b.kind) setKind(b.kind)
    setListOpen(false)
    setError(null)
  }

  function unlink() {
    setBankId(null)
    setLink({ kind: 'dismissed', text: normalizeBankText(name) })
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const amount = Number(digits || '0')
      const ownerBank = bankAccounts.find(a => a.id === bankAccountId)
      await onSubmit({
        name, kind, icon: shownIcon,
        // A card without its own logo shows its bank's
        bankId: bankId ?? (isCredit ? ownerBank?.bankId ?? null : null),
        // For a card the amount is what is already owed: stored as a negative balance
        openingBalance: isCredit ? -amount : negative ? -amount : amount,
        openingDate,
        card: isCredit
          ? {
            closingDay: Number(closingDay), dueDay: Number(dueDay), bankAccountId: bankAccountId ?? -1,
            ...(limitDigits ? { limit: Number(limitDigits) } : {}),
          }
          : undefined,
      })
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(suggestions[highlight]) }
    else if (e.key === 'Escape') { e.stopPropagation(); setListOpen(false) }
  }

  return (
    <div
      className={cx(css({ bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: 'xl', p: '4' }), 'slide-up')}
      onKeyDown={e => {
        if (e.key === 'Escape' && onCancel) { e.stopPropagation(); onCancel() }
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); void submit() }
      }}
    >
      {(title || onCancel) && (
        <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '3' })}>
          <div className={css({ fontSize: '15', fontWeight: 'semibold', color: 'ink' })}>{title}</div>
          {onCancel && (
            <button type="button" onClick={onCancel} aria-label="Cancelar" className={css({ w: '8', h: '8', mr: '-1', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'bg' } })}>
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}

      <div className={css({ display: 'flex', alignItems: 'flex-start', gap: '2' })}>
        {/* Icon: the bank logo when linked (✕ to remove), otherwise an editable emoji */}
        {bank ? (
          <div className={css({ position: 'relative', flexShrink: '0' })}>
            <AccountIcon account={{ icon: shownIcon, bankId: bank.id }} size={44} />
            <button
              type="button"
              onClick={unlink}
              aria-label={`Remover logo do ${bank.name}`}
              title="Usar emoji em vez da logo"
              className={css({ position: 'absolute', top: '-1.5', right: '-1.5', w: '5', h: '5', rounded: 'full', bg: 'ink', color: 'bg', display: 'flex', alignItems: 'center', justifyContent: 'center' })}
            >
              <X size={11} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <input
            aria-label="Emoji da conta"
            value={shownIcon}
            onChange={e => setIcon(firstGrapheme(e.target.value.replace(shownIcon, '')) || firstGrapheme(e.target.value))}
            className={css({ w: '11', h: '11', flexShrink: '0', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', textAlign: 'center', fontSize: '20', outline: 'none', _focus: { borderColor: 'muted/60' } })}
          />
        )}

        <div className={css({ position: 'relative', flex: '1', minW: '0' })}>
          <input
            autoFocus
            role="combobox"
            aria-label="Nome da conta"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={suggestions.length ? `${listId}-${highlight}` : undefined}
            placeholder="Nome do banco ou conta — ex.: Nubank"
            value={name}
            maxLength={30}
            onChange={e => changeName(e.target.value)}
            onKeyDown={onNameKeyDown}
            onFocus={() => setListOpen(true)}
            onBlur={() => setListOpen(false)}
            className={css({ w: 'full', h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '15', color: 'ink', _placeholder: { color: 'muted' }, outline: 'none', _focus: { borderColor: 'muted/60' } })}
          />
          {bank && (
            <div className={css({ mt: '1', fontSize: '12', color: 'muted' })}>
              Banco: <span className={css({ fontWeight: 'semibold', color: 'ink' })}>{bank.name}</span>
              {bank.compe && <span className="nums"> · {bank.compe}</span>}
            </div>
          )}

          {suggestions.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Bancos conhecidos"
              className={cx(css({ position: 'absolute', zIndex: '20', left: '0', right: '0', top: '12', m: '0', p: '1', listStyle: 'none', bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: 'xl', shadow: 'lg' }), 'slide-up')}
            >
              {suggestions.map((b, i) => (
                <li
                  key={b.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  // mousedown so the input's blur doesn't close the list before the click lands
                  onMouseDown={e => { e.preventDefault(); pick(b) }}
                  onMouseEnter={() => setHighlight(i)}
                  className={css({ display: 'flex', alignItems: 'center', gap: '2.5', h: '11', px: '2', rounded: 'lg', cursor: 'pointer' }, i === highlight ? { bg: 'bg' } : {})}
                >
                  <AccountIcon account={{ icon: b.kind ? ACCOUNT_KINDS[b.kind].icon : '🏦', bankId: b.id }} size={28} />
                  <span className={css({ flex: '1', fontSize: '14', fontWeight: 'medium', color: 'ink', truncate: true })}>{b.name}</span>
                  {b.compe && <span className={cx(css({ fontSize: '12', color: 'muted' }), 'nums')}>{b.compe}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={css({ mt: '3', display: 'flex', flexWrap: 'wrap', gap: '1.5' })} role="radiogroup" aria-label="Tipo de conta">
        {EDITABLE_KINDS.map(k => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={css({ h: '8', px: '3', rounded: 'full', borderWidth: '1px', fontSize: '12', fontWeight: 'semibold', transition: 'colors' }, kind === k ? { bg: 'ink', borderColor: 'ink', color: 'bg' } : { borderColor: 'border', color: 'muted', _hover: { color: 'ink' } })}
          >
            {ACCOUNT_KINDS[k].label}
          </button>
        ))}
      </div>

      {isCredit && (
        <div className={css({ mt: '4' })}>
          <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '1.5' })}>Banco do cartão</div>
          {bankAccounts.length === 0 ? (
            <p className={css({ m: '0', fontSize: '13', color: 'muted' })}>Cadastre primeiro a conta do banco — o cartão fica vinculado a ela.</p>
          ) : (
            <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' })} role="radiogroup" aria-label="Conta do banco">
              {bankAccounts.map(a => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={bankAccountId === a.id}
                  onClick={() => setBankAccountId(a.id as number)}
                  className={css({ display: 'flex', alignItems: 'center', gap: '1.5', h: '8', px: '3', rounded: 'full', borderWidth: '1px', fontSize: '12', fontWeight: 'semibold', transition: 'colors' }, bankAccountId === a.id ? { bg: 'ink', borderColor: 'ink', color: 'bg' } : { borderColor: 'border', color: 'muted', _hover: { color: 'ink' } })}
                >
                  <AccountIcon account={a} size="inline" />
                  {a.name}
                </button>
              ))}
            </div>
          )}
          <p className={css({ mt: '1.5', mb: '3', fontSize: '12', color: 'muted' })}>
            A fatura é paga por padrão a partir desta conta.
            {initial?.card && ' Mudar os dias vale só para compras novas — faturas já lançadas não mudam.'}
          </p>

          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '2' })}>
            <DayField label="Fecha dia" value={closingDay} onChange={setClosingDay} />
            <DayField label="Vence dia" value={dueDay} onChange={setDueDay} />
            <label className={css({ display: 'block', minW: '0' })}>
              <span className={css({ display: 'block', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted', mb: '1' })}>Limite</span>
              <input
                inputMode="numeric"
                placeholder="opcional"
                value={fmt(limitDigits)}
                onChange={e => setLimitDigits(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))}
                className={cx(css({ w: 'full', h: '11', px: '2.5', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', fontWeight: 'semibold', color: 'ink', _placeholder: { color: 'muted', fontWeight: 'normal' }, outline: 'none', _focus: { borderColor: 'muted/60' } }), 'nums')}
              />
            </label>
          </div>
        </div>
      )}

      <div className={css({ mt: '4', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted', mb: '1.5' })}>
        {isCredit ? 'Já devo neste cartão' : 'Saldo inicial'}
      </div>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
        {!isCredit && <button
          type="button"
          onClick={() => setNegative(n => !n)}
          aria-label={negative ? 'Saldo negativo — tocar para positivo' : 'Saldo positivo — tocar para negativo'}
          className={css({ w: '11', h: '11', flexShrink: '0', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '18', fontWeight: 'bold', color: 'ink' })}
        >
          {negative ? '−' : '+'}
        </button>}
        <div className={css({ flex: '1', minW: '0', h: '11', px: '3', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', display: 'flex', alignItems: 'center', gap: '1.5', _focusWithin: { borderColor: 'muted/60' } })}>
          <span className={css({ fontSize: '14', fontWeight: 'semibold', color: 'muted' })}>R$</span>
          <input
            inputMode="numeric"
            aria-label="Saldo inicial"
            placeholder="0,00"
            value={fmt(digits)}
            onChange={e => setDigits(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))}
            className={cx(css({ flex: '1', minW: '0', bg: 'transparent', fontSize: '15', fontWeight: 'semibold', color: 'ink', _placeholder: { color: 'muted' }, outline: 'none' }), 'nums')}
          />
        </div>
        <input
          type="date"
          aria-label="Data do saldo inicial"
          value={openingDate}
          onChange={e => setOpeningDate(e.target.value)}
          className={cx(css({ w: '[150px]', flexShrink: '0', h: '11', px: '2.5', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '14', color: 'ink', outline: 'none', _focus: { borderColor: 'muted/60' } }), 'nums')}
        />
      </div>
      <p className={css({ mt: '1.5', mb: '0', fontSize: '12', color: 'muted', lineHeight: 'relaxed' })}>
        {isCredit
          ? 'Faturas e parcelas que já existiam nesta data. Entra como dívida no patrimônio, não como despesa.'
          : 'Quanto já havia na conta nesta data. Entra no patrimônio, não nas receitas.'}
      </p>

      <div className={css({ mt: '4', display: 'flex', alignItems: 'center', gap: '3' })}>
        <p className={css({ flex: '1', m: '0', fontSize: '12' }, error ? { color: 'expense' } : { color: 'muted' })} role={error ? 'alert' : undefined}>
          {error ?? ''}
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || name.trim() === '' || (isCredit && (!closingDay || !dueDay || bankAccountId === null))}
          className={css({ h: '10', px: '5', rounded: 'full', bg: 'ink', color: 'bg', fontSize: '14', fontWeight: 'semibold', transition: 'opacity', _hover: { opacity: '0.9' }, _disabled: { opacity: '0.4', cursor: 'not-allowed' } })}
        >
          {busy ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function DayField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={css({ display: 'block', minW: '0' })}>
      <span className={css({ display: 'block', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: '[.08em]', color: 'muted', mb: '1' })}>{label}</span>
      <input
        inputMode="numeric"
        placeholder="1–31"
        value={value}
        onChange={e => {
          const d = e.target.value.replace(/\D/g, '').slice(0, 2)
          onChange(d === '' ? '' : String(Math.min(31, Math.max(1, Number(d)))))
        }}
        className={cx(css({ w: 'full', h: '11', px: '2.5', rounded: 'tile', borderWidth: '1px', borderColor: 'border', bg: 'bg', fontSize: '15', fontWeight: 'semibold', color: 'ink', _placeholder: { color: 'muted', fontWeight: 'normal' }, outline: 'none', _focus: { borderColor: 'muted/60' } }), 'nums')}
      />
    </label>
  )
}
