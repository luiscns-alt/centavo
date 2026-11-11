import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../../core/db'
import { LedgerError } from '../../core/ledger/base'
import { createAccount, deleteAccount, setAccountArchived, updateAccount } from './ledger'
import { useAccountBalances } from './useAccounts'
import { AccountEditor } from './AccountEditor'
import { AccountIcon } from './AccountIcon'
import { ACCOUNT_KINDS } from '../../core/constants/domain'
import { formatBalance } from '../../shared/utils/money'
import { css, cx } from '../../../styled-system/css'
import { nums, slideUp } from '../../shared/ui/atoms'

type Editing = { mode: 'new' } | { mode: 'edit'; id: number } | { mode: 'delete'; id: number } | null


/** Ajustes → Contas: create, edit (incl. saldo inicial), archive, delete unused */
export function AccountsSection({ onOpenLoan, onNewLoan }: { onOpenLoan: (id: number) => void; onNewLoan: () => void }) {
  const { accounts, total } = useAccountBalances()
  const loans = useLiveQuery(() => db.loans.toArray())
  const loanOf = (accountId: number) => loans?.find(l => l.accountId === accountId)
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)

  const usage = useLiveQuery(async () => {
    const [txs, trs] = await Promise.all([db.transactions.toArray(), db.transfers.toArray()])
    const m = new Map<number, number>()
    const inc = (id: number) => m.set(id, (m.get(id) ?? 0) + 1)
    txs.forEach(t => inc(t.accountId))
    trs.forEach(t => { inc(t.fromAccountId); inc(t.toAccountId) })
    return m
  })

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      setEditing(null)
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível concluir. Tente novamente.')
    }
  }

  return (
    <section className={css({ mt: '6' })}>
      <div className={css({ px: '5', md: { px: '1' }, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: '2' })}>
        <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Contas</div>
        {accounts.length > 0 && (
          <div className={cx(css({ fontSize: '12', color: 'muted' }), nums)}>Patrimônio <span className={css({ fontWeight: 'semibold', color: 'ink' })}>{formatBalance(total)}</span></div>
        )}
      </div>

      <div className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl', overflow: 'hidden' })}>
        {accounts.length === 0 && editing?.mode !== 'new' && (
          <p className={css({ m: '0', px: '5', pt: '5', pb: '2', fontSize: '13', color: 'muted', lineHeight: 'relaxed' })}>
            Nenhuma conta ainda. Cadastre cada banco, poupança ou carteira com o saldo que já tem.
          </p>
        )}

        <ul className={css({ m: '0', p: '0', listStyle: 'none', '& > :not(:last-child)': { borderBottomWidth: '1px', borderColor: 'border' } })}>
          {accounts.map(a => {
            const used = usage?.get(a.id) ?? 0
            if (editing?.mode === 'edit' && editing.id === a.id) {
              return (
                <li key={a.id} className={css({ p: '2' })}>
                  <AccountEditor
                    title="Editar conta"
                    submitLabel="Salvar"
                    initial={{ name: a.name, kind: a.kind, icon: a.icon, bankId: a.bankId, openingBalance: a.openingBalance, openingDate: a.openingDate, card: a.card }}
                    onSubmit={async v => { await updateAccount(a.id, v); setEditing(null) }}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              )
            }
            const confirming = editing?.mode === 'delete' && editing.id === a.id
            return (
              <li key={a.id} className={css({ display: 'flex', alignItems: 'center', gap: '3', pl: '4', pr: '2', minH: '16', py: '2' }, a.archived ? { opacity: '0.6' } : {})}>
                <AccountIcon account={a} />
                <div className={css({ flex: '1', minW: '0' })}>
                  <div className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{a.name}</div>
                  <div className={css({ fontSize: '12', color: 'muted', truncate: true })}>
                    {a.card ? `Cartão · fecha ${a.card.closingDay} · vence ${a.card.dueDay}` : a.kind === 'loan' ? 'Empréstimo · saldo devedor' : ACCOUNT_KINDS[a.kind].label}
                    {a.archived ? ' · arquivada' : ''}
                    {' · '}
                    <span className={cx(css({ fontWeight: 'semibold' }, a.balance < 0 ? { color: 'expense' } : { color: 'ink' }), nums)}>{formatBalance(a.balance)}</span>
                  </div>
                </div>
                {a.kind === 'loan' ? (
                  <button
                    onClick={() => { const l = loanOf(a.id); if (l) onOpenLoan(l.id as number) }}
                    className={css({ h: '8', px: '3', rounded: 'full', borderWidth: '1px', borderColor: 'border', fontSize: '12', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' } })}
                  >
                    Abrir
                  </button>
                ) : confirming ? (
                  <div className={cx(css({ display: 'flex', alignItems: 'center', gap: '1.5' }), slideUp)}>
                    <button onClick={() => setEditing(null)} className={css({ h: '8', px: '3', rounded: 'full', fontSize: '12', fontWeight: 'semibold', color: 'muted', _hover: { color: 'ink' } })}>
                      Cancelar
                    </button>
                    <button onClick={() => void run(() => deleteAccount(a.id))} className={css({ h: '8', px: '3', rounded: 'full', bg: 'ink', color: 'bg', fontSize: '12', fontWeight: 'semibold' })}>
                      Excluir
                    </button>
                  </div>
                ) : (
                  <div className={css({ display: 'flex', alignItems: 'center', flexShrink: '0' })}>
                    <IconButton label={`Editar ${a.name}`} onClick={() => { setError(null); setEditing({ mode: 'edit', id: a.id }) }}>
                      <Pencil size={16} strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      label={a.archived ? `Reativar ${a.name}` : `Arquivar ${a.name}`}
                      onClick={() => void run(() => setAccountArchived(a.id, !a.archived))}
                    >
                      {a.archived ? <ArchiveRestore size={16} strokeWidth={1.75} /> : <Archive size={16} strokeWidth={1.75} />}
                    </IconButton>
                    <IconButton
                      label={`Excluir ${a.name}`}
                      disabled={used > 0}
                      title={used > 0 ? 'Tem movimentações — arquive em vez de excluir' : undefined}
                      onClick={() => { setError(null); setEditing({ mode: 'delete', id: a.id }) }}
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className={css(accounts.length ? { borderTopWidth: '1px', borderColor: 'border' } : {}, { p: '2' })}>
          {editing?.mode === 'new' ? (
            <AccountEditor
              title="Nova conta"
              onSubmit={async v => { await createAccount(v); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', sm: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, gap: '1' })}>
              <button
                onClick={() => { setError(null); setEditing({ mode: 'new' }) }}
                className={css({ w: 'full', h: '11', rounded: 'xl', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5', fontSize: '14', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' }, transition: 'colors' })}
              >
                <Plus size={16} strokeWidth={2} />
                Nova conta ou cartão
              </button>
              <button
                onClick={onNewLoan}
                className={css({ w: 'full', h: '11', rounded: 'xl', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5', fontSize: '14', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' }, transition: 'colors' })}
              >
                <Plus size={16} strokeWidth={2} />
                Empréstimo ou financiamento
              </button>
            </div>
          )}
        </div>
      </div>

      <p className={css({ px: '5', md: { px: '1' }, mt: '2', mb: '0', fontSize: '12' }, error ? { color: 'ink' } : { color: 'muted' })} role={error ? 'alert' : undefined}>
        {error ?? 'Contas com movimentações podem ser arquivadas, mas não excluídas — o histórico fica intacto.'}
      </p>
    </section>
  )
}

function IconButton({ label, onClick, disabled, title, children }: {
  label: string; onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={css({ w: '9', h: '9', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'muted', _hover: { color: 'ink', bg: 'bg' }, transition: 'colors', _disabled: { opacity: '0.3', _hover: { bg: 'transparent', color: 'muted' }, cursor: 'not-allowed' } })}
    >
      {children}
    </button>
  )
}
